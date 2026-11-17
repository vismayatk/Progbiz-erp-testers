// encode.swift — image sequence (+ optional audio) -> H.264 / AAC MP4.
//
// Uses only Swift + AVFoundation (there is no ffmpeg on the build machine).
//
//   encode <framesDir> <fps> <audio.wav|none> <out.mp4> [options]
//
// Frames are read as r_000001.jpg, r_000002.jpg ... (also .jpeg / .png) in
// numeric order. Output: H.264 High profile, square pixels, BT.709 tags,
// constant frame rate, fast-start MP4, optional AAC-LC 48 kHz audio track.
//
// Memory: frames are decoded by a bounded look-ahead pipeline (at most
// `--jobs` decoded frames exist at any time) and appended only while the
// writer input reports isReadyForMoreMediaData, so a 7,200-frame job uses the
// same memory as a 300-frame job.

import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
import CoreGraphics
import ImageIO
import AudioToolbox
import Accelerate

setvbuf(stdout, nil, _IOLBF, 0)

// ---------------------------------------------------------------- utilities

func eprint(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

func die(_ msg: String, code: Int32 = 1) -> Never {
    eprint("encode: ERROR: \(msg)")
    exit(code)
}

let usage = """
usage: encode <framesDir> <fps> <audio.wav|none> <out.mp4> [options]

  framesDir   directory holding r_000001.jpg, r_000002.jpg ... (.jpg/.jpeg/.png)
  fps         30 | 25 | 60 | 30000/1001 ...
  audio       WAV/AIFF/M4A file, or the word  none
  out.mp4     output file (written to a temp file, renamed on success)

options:
  --bitrate N          video average bitrate in bit/s      (default 12000000)
  --audio-bitrate N    AAC bitrate in bit/s                (default 192000)
  --audio-channels N   1 or 2 output channels              (default 2; mono input is duplicated L=R)
  --keyint S           max seconds between keyframes       (default 2)
  --size WxH           output size                         (default 1920x1080)
  --jobs N             parallel frame decoders / look-ahead (default min(cores, 8))
  --bframes            allow frame reordering (B-frames)   (default off)
  --limit N            encode only the first N frames
  --audio-strategy S   cbr | abr                           (default cbr)
  --no-audio-fit       do not pad / trim the audio to the video length
"""

struct Options {
    var framesDir = ""
    var fpsNum: Int32 = 30
    var fpsDen: Int32 = 1
    var audioPath: String? = nil
    var outPath = ""
    var bitrate = 12_000_000
    var audioBitrate = 192_000
    var audioChannels = 2
    var keyintSec = 2.0
    var width = 1920
    var height = 1080
    var jobs = max(2, min(ProcessInfo.processInfo.activeProcessorCount, 8))
    var bframes = false
    var limit: Int? = nil
    var audioFit = true
    var audioStrategy = AVAudioBitRateStrategy_Constant

    var fps: Double { Double(fpsNum) / Double(fpsDen) }
}

func parseFPS(_ s: String) -> (Int32, Int32)? {
    if s.contains("/") {
        let p = s.split(separator: "/")
        guard p.count == 2, let n = Int32(p[0]), let d = Int32(p[1]), n > 0, d > 0 else { return nil }
        return (n, d)
    }
    if let n = Int32(s), n > 0 { return (n, 1) }
    if let f = Double(s), f > 0 {
        // common NTSC rates
        if abs(f - 29.97) < 0.005 { return (30000, 1001) }
        if abs(f - 23.976) < 0.005 { return (24000, 1001) }
        if abs(f - 59.94) < 0.005 { return (60000, 1001) }
        return (Int32((f * 1000).rounded()), 1000)
    }
    return nil
}

func parseArgs() -> Options {
    var o = Options()
    var pos: [String] = []
    var it = CommandLine.arguments.dropFirst().makeIterator()
    func intValue(_ name: String, _ v: String?) -> Int {
        guard let v = v, let n = Int(v), n > 0 else { die("\(name) needs a positive integer\n\n\(usage)") }
        return n
    }
    while let a = it.next() {
        switch a {
        case "-h", "--help":
            print(usage); exit(0)
        case "--bitrate": o.bitrate = intValue(a, it.next())
        case "--audio-bitrate": o.audioBitrate = intValue(a, it.next())
        case "--audio-channels":
            o.audioChannels = intValue(a, it.next())
            if o.audioChannels != 1 && o.audioChannels != 2 { die("--audio-channels must be 1 or 2") }
        case "--keyint":
            guard let v = it.next(), let d = Double(v), d > 0 else { die("--keyint needs seconds > 0") }
            o.keyintSec = d
        case "--size":
            guard let v = it.next() else { die("--size needs WxH") }
            let p = v.lowercased().split(separator: "x")
            guard p.count == 2, let w = Int(p[0]), let h = Int(p[1]), w > 0, h > 0, w % 2 == 0, h % 2 == 0 else {
                die("--size needs even WxH, e.g. 1920x1080")
            }
            o.width = w; o.height = h
        case "--jobs": o.jobs = min(32, intValue(a, it.next()))
        case "--bframes": o.bframes = true
        case "--limit": o.limit = intValue(a, it.next())
        case "--no-audio-fit": o.audioFit = false
        case "--audio-strategy":
            switch (it.next() ?? "").lowercased() {
            case "cbr": o.audioStrategy = AVAudioBitRateStrategy_Constant
            case "abr": o.audioStrategy = AVAudioBitRateStrategy_LongTermAverage
            default: die("--audio-strategy must be cbr or abr")
            }
        default:
            if a.hasPrefix("--") { die("unknown option \(a)\n\n\(usage)") }
            pos.append(a)
        }
    }
    guard pos.count == 4 else { die("expected 4 positional arguments, got \(pos.count)\n\n\(usage)") }
    o.framesDir = pos[0]
    guard let f = parseFPS(pos[1]) else { die("cannot parse fps '\(pos[1])'") }
    o.fpsNum = f.0; o.fpsDen = f.1
    o.audioPath = (pos[2].lowercased() == "none" || pos[2].isEmpty) ? nil : pos[2]
    o.outPath = pos[3]
    return o
}

// ------------------------------------------------------------ frame listing

func listFrames(dir: String) -> [URL] {
    let dirURL = URL(fileURLWithPath: dir, isDirectory: true)
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: dir, isDirectory: &isDir), isDir.boolValue else {
        die("frames directory not found: \(dir)")
    }
    let names: [String]
    do { names = try FileManager.default.contentsOfDirectory(atPath: dir) }
    catch { die("cannot list \(dir): \(error.localizedDescription)") }

    var found: [(Int, String)] = []
    for n in names {
        let lower = n.lowercased()
        guard lower.hasPrefix("r_") else { continue }
        guard let dot = lower.lastIndex(of: ".") else { continue }
        let ext = String(lower[lower.index(after: dot)...])
        guard ext == "jpg" || ext == "jpeg" || ext == "png" else { continue }
        let digits = lower[lower.index(lower.startIndex, offsetBy: 2)..<dot]
        guard !digits.isEmpty, digits.allSatisfy({ $0.isASCII && $0.isNumber }), let idx = Int(digits) else { continue }
        found.append((idx, n))
    }
    guard !found.isEmpty else { die("no frames named r_000001.jpg / .png found in \(dir)") }
    found.sort { $0.0 < $1.0 }
    for i in 1..<max(1, found.count) where found.count > 1 {
        if found[i].0 == found[i - 1].0 {
            die("duplicate frame number \(found[i].0): \(found[i - 1].1) and \(found[i].1)")
        }
        if found[i].0 != found[i - 1].0 + 1 {
            die("frame numbering has a gap: \(found[i - 1].1) is followed by \(found[i].1)")
        }
    }
    return found.map { dirURL.appendingPathComponent($0.1) }
}

// ------------------------------------------------------------ frame decoding

struct FrameError: Error, CustomStringConvertible {
    let description: String
}

let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
let warnLock = NSLock()
nonisolated(unsafe) var warnedSizes = Set<String>()

// RGB -> Y'CbCr is done here with vImage (BT.709 matrix, video range) and the
// encoder is fed native 4:2:0 buffers. Handing BGRA buffers to the encoder
// instead was measured to store white as Y=233 (not 235) and grey 128 as 125:
// its internal conversion is low precision, which dulls white UI backgrounds.
nonisolated(unsafe) var yuvConversion = vImage_ARGBToYpCbCr()

func setupColourConversion() {
    var range = vImage_YpCbCrPixelRange(Yp_bias: 16, CbCr_bias: 128,
                                        YpRangeMax: 235, CbCrRangeMax: 240,
                                        YpMax: 235, YpMin: 16, CbCrMax: 240, CbCrMin: 16)
    let rc = vImageConvert_ARGBToYpCbCr_GenerateConversion(
        kvImage_ARGBToYpCbCrMatrix_ITU_R_709_2, &range, &yuvConversion,
        kvImageARGB8888, kvImage420Yp8_CbCr8, vImage_Flags(kvImageNoFlags))
    if rc != kvImageNoError { die("vImage colour conversion setup failed (\(rc))") }
}

/// Decode one image file and convert it into a pooled 4:2:0 video-range buffer.
func loadFrame(url: URL, pool: CVPixelBufferPool, width: Int, height: Int) throws -> CVPixelBuffer {
    let srcOpts = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let src = CGImageSourceCreateWithURL(url as CFURL, srcOpts),
          let img = CGImageSourceCreateImageAtIndex(src, 0, srcOpts) else {
        throw FrameError(description: "cannot decode image \(url.path)")
    }
    if img.width != width || img.height != height {
        let srcAR = Double(img.width) / Double(img.height)
        let dstAR = Double(width) / Double(height)
        if abs(srcAR - dstAR) / dstAR > 0.01 {
            throw FrameError(description:
                "\(url.lastPathComponent) is \(img.width)x\(img.height); aspect ratio does not match output \(width)x\(height)")
        }
        let key = "\(img.width)x\(img.height)"
        warnLock.lock()
        let first = warnedSizes.insert(key).inserted
        warnLock.unlock()
        if first {
            eprint("encode: note: frames of size \(key) are resampled to \(width)x\(height) (first seen: \(url.lastPathComponent))")
        }
    }

    // 1. image -> BGRX bitmap holding sRGB-encoded values
    guard let ctx = CGContext(data: nil,
                              width: width, height: height,
                              bitsPerComponent: 8,
                              bytesPerRow: width * 4,
                              space: sRGB,
                              bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
          let rgb = ctx.data
    else {
        throw FrameError(description: "cannot create drawing context for \(url.lastPathComponent)")
    }
    // Opaque black underlay (matters only for images with transparency).
    ctx.setFillColor(red: 0, green: 0, blue: 0, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.interpolationQuality = .high
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))

    // 2. BGRX -> Y'CbCr 4:2:0 (BT.709, video range) into a pooled buffer
    var pbOut: CVPixelBuffer?
    let rc = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pbOut)
    guard rc == kCVReturnSuccess, let pb = pbOut else {
        throw FrameError(description: "CVPixelBufferPoolCreatePixelBuffer failed (\(rc))")
    }
    CVPixelBufferLockBaseAddress(pb, [])
    defer { CVPixelBufferUnlockBaseAddress(pb, []) }
    guard CVPixelBufferGetPlaneCount(pb) == 2,
          let yBase = CVPixelBufferGetBaseAddressOfPlane(pb, 0),
          let cBase = CVPixelBufferGetBaseAddressOfPlane(pb, 1) else {
        throw FrameError(description: "unexpected pixel buffer layout")
    }
    var srcBuf = vImage_Buffer(data: rgb, height: vImagePixelCount(height), width: vImagePixelCount(width),
                               rowBytes: ctx.bytesPerRow)
    var yBuf = vImage_Buffer(data: yBase,
                             height: vImagePixelCount(CVPixelBufferGetHeightOfPlane(pb, 0)),
                             width: vImagePixelCount(CVPixelBufferGetWidthOfPlane(pb, 0)),
                             rowBytes: CVPixelBufferGetBytesPerRowOfPlane(pb, 0))
    var cBuf = vImage_Buffer(data: cBase,
                             height: vImagePixelCount(CVPixelBufferGetHeightOfPlane(pb, 1)),
                             width: vImagePixelCount(CVPixelBufferGetWidthOfPlane(pb, 1)),
                             rowBytes: CVPixelBufferGetBytesPerRowOfPlane(pb, 1))
    let permute: [UInt8] = [3, 2, 1, 0]   // memory order B,G,R,X -> A,R,G,B
    let vrc = vImageConvert_ARGB8888To420Yp8_CbCr8(&srcBuf, &yBuf, &cBuf, &yuvConversion, permute,
                                                   vImage_Flags(kvImageDoNotTile))
    guard vrc == kvImageNoError else {
        throw FrameError(description: "vImage RGB->YCbCr failed (\(vrc)) for \(url.lastPathComponent)")
    }

    // Tagged BT.709 like the output, so AVAssetWriter performs no conversion.
    CVBufferSetAttachment(pb, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
    return pb
}

/// Ordered, bounded, parallel frame decoder.
/// At most `lookAhead` decoded frames are alive at any moment.
final class FramePipeline: @unchecked Sendable {
    private let files: [URL]
    private let pool: CVPixelBufferPool
    private let width: Int
    private let height: Int
    private let cond = NSCondition()
    private var ready: [Int: Result<CVPixelBuffer, Error>] = [:]
    private var nextToConsume = 0
    private let slots: DispatchSemaphore
    private let work = DispatchQueue(label: "encode.decode", qos: .userInitiated, attributes: .concurrent)
    private let feeder = DispatchQueue(label: "encode.feeder", qos: .userInitiated)

    init(files: [URL], pool: CVPixelBufferPool, width: Int, height: Int, lookAhead: Int) {
        self.files = files
        self.pool = pool
        self.width = width
        self.height = height
        self.slots = DispatchSemaphore(value: lookAhead)
    }

    func start() {
        feeder.async {
            for i in 0..<self.files.count {
                self.slots.wait() // back-pressure: released when the frame is consumed
                self.work.async {
                    let r: Result<CVPixelBuffer, Error> = autoreleasepool {
                        Result { try loadFrame(url: self.files[i], pool: self.pool, width: self.width, height: self.height) }
                    }
                    self.cond.lock()
                    self.ready[i] = r
                    self.cond.broadcast()
                    self.cond.unlock()
                }
            }
        }
    }

    var remaining: Int { files.count - nextToConsume }

    /// Blocks until the next frame (in order) is decoded. nil = no more frames.
    func next() throws -> CVPixelBuffer? {
        if nextToConsume >= files.count { return nil }
        cond.lock()
        while ready[nextToConsume] == nil { cond.wait() }
        let r = ready.removeValue(forKey: nextToConsume)!
        cond.unlock()
        nextToConsume += 1
        slots.signal()
        return try r.get()
    }
}

// -------------------------------------------------------------------- audio

let kAudioRate = 48_000

func pcmDescription(channels: Int) -> AudioStreamBasicDescription {
    AudioStreamBasicDescription(
        mSampleRate: Double(kAudioRate),
        mFormatID: kAudioFormatLinearPCM,
        mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
        mBytesPerPacket: UInt32(2 * channels),
        mFramesPerPacket: 1,
        mBytesPerFrame: UInt32(2 * channels),
        mChannelsPerFrame: UInt32(channels),
        mBitsPerChannel: 16,
        mReserved: 0)
}

/// Bitrates the system AAC-LC encoder accepts for this rate / channel count.
func applicableAACBitrates(channels: Int) -> [(Double, Double)] {
    var inFmt = pcmDescription(channels: channels)
    var outFmt = AudioStreamBasicDescription(
        mSampleRate: Double(kAudioRate), mFormatID: kAudioFormatMPEG4AAC, mFormatFlags: 0,
        mBytesPerPacket: 0, mFramesPerPacket: 1024, mBytesPerFrame: 0,
        mChannelsPerFrame: UInt32(channels), mBitsPerChannel: 0, mReserved: 0)
    var conv: AudioConverterRef?
    guard AudioConverterNew(&inFmt, &outFmt, &conv) == noErr, let c = conv else { return [] }
    defer { AudioConverterDispose(c) }
    var size: UInt32 = 0
    guard AudioConverterGetPropertyInfo(c, kAudioConverterApplicableEncodeBitRates, &size, nil) == noErr, size > 0 else {
        return []
    }
    let count = Int(size) / MemoryLayout<AudioValueRange>.stride
    var ranges = [AudioValueRange](repeating: AudioValueRange(mMinimum: 0, mMaximum: 0), count: count)
    let rc = ranges.withUnsafeMutableBytes { raw in
        AudioConverterGetProperty(c, kAudioConverterApplicableEncodeBitRates, &size, raw.baseAddress!)
    }
    guard rc == noErr else { return [] }
    return ranges.map { ($0.mMinimum, $0.mMaximum) }
}

func pickAACBitrate(requested: Int, channels: Int) -> Int {
    let ranges = applicableAACBitrates(channels: channels)
    if ranges.isEmpty { return requested }
    let r = Double(requested)
    if ranges.contains(where: { r >= $0.0 && r <= $0.1 }) { return requested }
    // nearest permitted value
    var best = ranges[0].1
    var bestDist = Double.greatestFiniteMagnitude
    for (lo, hi) in ranges {
        for v in [lo, hi] {
            let d = abs(v - r)
            if d < bestDist { bestDist = d; best = v }
        }
    }
    eprint("encode: note: AAC \(requested) bit/s is not available for \(channels) channel(s) at \(kAudioRate) Hz; using \(Int(best)) bit/s")
    return Int(best)
}

/// Reads any audio file as 48 kHz 16-bit PCM, maps it to the output channel
/// count, optionally trims / pads with silence to `targetFrames`.
final class AudioFeeder: @unchecked Sendable {
    let reader: AVAssetReader
    let output: AVAssetReaderAudioMixOutput
    let srcChannels: Int
    let outChannels: Int
    let format: CMAudioFormatDescription
    let targetFrames: Int64?      // nil = pass the source through unchanged in length
    private(set) var framesWritten: Int64 = 0
    private(set) var sourceFrames: Int64 = 0
    private(set) var paddedFrames: Int64 = 0
    private(set) var trimmed = false
    private var readerDone = false

    init(asset: AVAsset, track: AVAssetTrack, sourceChannelCount: Int, outChannels: Int, targetFrames: Int64?) throws {
        self.srcChannels = sourceChannelCount >= 2 ? 2 : 1
        self.outChannels = outChannels
        self.targetFrames = targetFrames
        reader = try AVAssetReader(asset: asset)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: kAudioRate,
            AVNumberOfChannelsKey: srcChannels,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ]
        output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: settings)
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw FrameError(description: "cannot add audio reader output") }
        reader.add(output)

        var asbd = pcmDescription(channels: outChannels)
        var layout = AudioChannelLayout()
        layout.mChannelLayoutTag = outChannels == 2 ? kAudioChannelLayoutTag_Stereo : kAudioChannelLayoutTag_Mono
        var fd: CMAudioFormatDescription?
        let rc = CMAudioFormatDescriptionCreate(
            allocator: kCFAllocatorDefault, asbd: &asbd,
            layoutSize: MemoryLayout<AudioChannelLayout>.size, layout: &layout,
            magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &fd)
        guard rc == noErr, let f = fd else { throw FrameError(description: "CMAudioFormatDescriptionCreate failed (\(rc))") }
        format = f
        guard reader.startReading() else {
            throw FrameError(description: "audio reader failed to start: \(reader.error?.localizedDescription ?? "unknown")")
        }
    }

    private func makeBuffer(_ samples: [Int16], frames: Int) throws -> CMSampleBuffer {
        let byteCount = frames * outChannels * 2
        var bb: CMBlockBuffer?
        var rc = CMBlockBufferCreateWithMemoryBlock(
            allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: byteCount,
            blockAllocator: kCFAllocatorDefault, customBlockSource: nil,
            offsetToData: 0, dataLength: byteCount, flags: kCMBlockBufferAssureMemoryNowFlag,
            blockBufferOut: &bb)
        guard rc == noErr, let block = bb else { throw FrameError(description: "CMBlockBufferCreate failed (\(rc))") }
        rc = samples.withUnsafeBytes { raw in
            CMBlockBufferReplaceDataBytes(with: raw.baseAddress!, blockBuffer: block,
                                          offsetIntoDestination: 0, dataLength: byteCount)
        }
        guard rc == noErr else { throw FrameError(description: "CMBlockBufferReplaceDataBytes failed (\(rc))") }
        var sb: CMSampleBuffer?
        rc = CMAudioSampleBufferCreateReadyWithPacketDescriptions(
            allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: format,
            sampleCount: frames,
            presentationTimeStamp: CMTime(value: framesWritten, timescale: CMTimeScale(kAudioRate)),
            packetDescriptions: nil, sampleBufferOut: &sb)
        guard rc == noErr, let out = sb else { throw FrameError(description: "CMAudioSampleBufferCreate failed (\(rc))") }
        framesWritten += Int64(frames)
        return out
    }

    /// nil = finished.
    func next() throws -> CMSampleBuffer? {
        if let t = targetFrames, framesWritten >= t {
            if !readerDone {
                // anything still unread is cut off
                if let extra = output.copyNextSampleBuffer(), CMSampleBufferGetNumSamples(extra) > 0 { trimmed = true }
                reader.cancelReading()
                readerDone = true
            }
            return nil
        }
        while !readerDone {
            guard let sb = output.copyNextSampleBuffer() else {
                readerDone = true
                if reader.status == .failed {
                    throw FrameError(description: "audio read failed: \(reader.error?.localizedDescription ?? "unknown")")
                }
                break
            }
            var n = CMSampleBufferGetNumSamples(sb)
            if n == 0 { continue }
            guard let block = CMSampleBufferGetDataBuffer(sb) else { continue }
            var src = [Int16](repeating: 0, count: n * srcChannels)
            let rc = src.withUnsafeMutableBytes { raw in
                CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: n * srcChannels * 2, destination: raw.baseAddress!)
            }
            guard rc == noErr else { throw FrameError(description: "CMBlockBufferCopyDataBytes failed (\(rc))") }
            sourceFrames += Int64(n)
            if let t = targetFrames, framesWritten + Int64(n) > t {
                n = Int(t - framesWritten)
                trimmed = true
            }
            if n <= 0 { return nil }
            var dst: [Int16]
            if srcChannels == outChannels {
                dst = Array(src[0..<(n * outChannels)])
            } else if srcChannels == 1 && outChannels == 2 {
                dst = [Int16](repeating: 0, count: n * 2)
                for i in 0..<n { let v = src[i]; dst[2 * i] = v; dst[2 * i + 1] = v }
            } else { // 2 -> 1
                dst = [Int16](repeating: 0, count: n)
                for i in 0..<n { dst[i] = Int16((Int32(src[2 * i]) + Int32(src[2 * i + 1])) / 2) }
            }
            return try makeBuffer(dst, frames: n)
        }
        // source exhausted: pad with silence up to the target length
        if let t = targetFrames, framesWritten < t {
            let n = Int(min(Int64(8192), t - framesWritten))
            paddedFrames += Int64(n)
            return try makeBuffer([Int16](repeating: 0, count: n * outChannels), frames: n)
        }
        return nil
    }
}

// --------------------------------------------------------------------- main

let opt = parseArgs()
let t0 = Date()
setupColourConversion()

var frames = listFrames(dir: opt.framesDir)
if let lim = opt.limit, lim < frames.count { frames = Array(frames[0..<lim]) }
let frameCount = frames.count

// Time base: integer ticks per frame so the stream is exactly constant-rate.
let scaleMul: Int32 = opt.fpsDen == 1 ? 1000 : 1
let timescale = CMTimeScale(opt.fpsNum * scaleMul)
let ticksPerFrame = Int64(opt.fpsDen * scaleMul)
func pts(_ i: Int) -> CMTime { CMTime(value: Int64(i) * ticksPerFrame, timescale: timescale) }
let endTime = pts(frameCount)
let videoSeconds = CMTimeGetSeconds(endTime)

let outURL = URL(fileURLWithPath: opt.outPath)
let outDir = outURL.deletingLastPathComponent()
do { try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true) }
catch { die("cannot create output directory \(outDir.path): \(error.localizedDescription)") }
let tmpURL = outDir.appendingPathComponent(".\(outURL.deletingPathExtension().lastPathComponent).partial-\(getpid()).mp4")
try? FileManager.default.removeItem(at: tmpURL)

print("encode: \(frameCount) frames @ \(String(format: "%.3f", opt.fps)) fps = \(String(format: "%.3f", videoSeconds)) s, "
      + "\(opt.width)x\(opt.height), video \(opt.bitrate) bit/s, keyframe <= \(opt.keyintSec) s, jobs \(opt.jobs)")
print("encode: first frame \(frames.first!.lastPathComponent), last frame \(frames.last!.lastPathComponent)")

let writer: AVAssetWriter
do { writer = try AVAssetWriter(outputURL: tmpURL, fileType: .mp4) }
catch { die("cannot create AVAssetWriter: \(error.localizedDescription)") }
writer.shouldOptimizeForNetworkUse = true   // moov before mdat ("fast start")
if 600 % Int(opt.fpsNum) != 0 || opt.fpsDen != 1 { writer.movieTimeScale = timescale }

// ---- video input
let keyintFrames = max(1, Int((opt.keyintSec * opt.fps).rounded(.down)))
let compression: [String: Any] = [
    AVVideoAverageBitRateKey: opt.bitrate,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
    AVVideoMaxKeyFrameIntervalKey: keyintFrames,
    AVVideoMaxKeyFrameIntervalDurationKey: opt.keyintSec,
    AVVideoExpectedSourceFrameRateKey: opt.fps,
    AVVideoAllowFrameReorderingKey: opt.bframes,
]
let videoSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: opt.width,
    AVVideoHeightKey: opt.height,
    AVVideoPixelAspectRatioKey: [
        AVVideoPixelAspectRatioHorizontalSpacingKey: 1,
        AVVideoPixelAspectRatioVerticalSpacingKey: 1,
    ],
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: compression,
]
guard writer.canApply(outputSettings: videoSettings, forMediaType: .video) else {
    die("the video output settings are not accepted by AVAssetWriter")
}
let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
videoInput.expectsMediaDataInRealTime = false
videoInput.mediaTimeScale = timescale
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: videoInput,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        kCVPixelBufferWidthKey as String: opt.width,
        kCVPixelBufferHeightKey as String: opt.height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ])
guard writer.canAdd(videoInput) else { die("cannot add the video input to the writer") }
writer.add(videoInput)

// ---- audio input (optional)
var audioInput: AVAssetWriterInput? = nil
var audioFeeder: AudioFeeder? = nil
var audioSourceSeconds = 0.0
var audioBitrateUsed = 0

if let ap = opt.audioPath {
    guard FileManager.default.fileExists(atPath: ap) else { die("audio file not found: \(ap)") }
    let asset = AVURLAsset(url: URL(fileURLWithPath: ap))
    let sem = DispatchSemaphore(value: 0)
    nonisolated(unsafe) var loadedTrack: AVAssetTrack? = nil
    nonisolated(unsafe) var loadedChannels = 1
    nonisolated(unsafe) var loadedRate = 0.0
    nonisolated(unsafe) var loadedDuration = 0.0
    nonisolated(unsafe) var loadError: String? = nil
    Task {
        do {
            let tracks = try await asset.loadTracks(withMediaType: .audio)
            guard let t = tracks.first else { loadError = "no audio track in \(ap)"; sem.signal(); return }
            let fds = try await t.load(.formatDescriptions)
            if let fd = fds.first, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd)?.pointee {
                loadedChannels = Int(asbd.mChannelsPerFrame)
                loadedRate = asbd.mSampleRate
            }
            loadedDuration = CMTimeGetSeconds(try await asset.load(.duration))
            loadedTrack = t
        } catch {
            loadError = "cannot open audio \(ap): \(error.localizedDescription)"
        }
        sem.signal()
    }
    sem.wait()
    if let e = loadError { die(e) }
    guard let track = loadedTrack else { die("no audio track in \(ap)") }
    audioSourceSeconds = loadedDuration

    let target: Int64? = opt.audioFit ? Int64((videoSeconds * Double(kAudioRate)).rounded()) : nil
    do {
        audioFeeder = try AudioFeeder(asset: asset, track: track, sourceChannelCount: loadedChannels,
                                      outChannels: opt.audioChannels, targetFrames: target)
    } catch { die("audio setup failed: \(error)") }

    audioBitrateUsed = pickAACBitrate(requested: opt.audioBitrate, channels: opt.audioChannels)
    var layout = AudioChannelLayout()
    layout.mChannelLayoutTag = opt.audioChannels == 2 ? kAudioChannelLayoutTag_Stereo : kAudioChannelLayoutTag_Mono
    let audioSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: kAudioRate,
        AVNumberOfChannelsKey: opt.audioChannels,
        AVEncoderBitRateKey: audioBitrateUsed,
        // Constant bitrate: the default long-term-average strategy drops far
        // below the target on narration with pauses (measured 92 kbit/s for a
        // 192 kbit/s request), CBR keeps the track at the requested rate.
        AVEncoderBitRateStrategyKey: opt.audioStrategy,
        AVChannelLayoutKey: Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size),
    ]
    guard writer.canApply(outputSettings: audioSettings, forMediaType: .audio) else {
        die("the audio output settings are not accepted by AVAssetWriter")
    }
    let ai = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings, sourceFormatHint: audioFeeder!.format)
    ai.expectsMediaDataInRealTime = false
    guard writer.canAdd(ai) else { die("cannot add the audio input to the writer") }
    writer.add(ai)
    audioInput = ai
    print("encode: audio \(ap): \(String(format: "%.3f", loadedDuration)) s, \(Int(loadedRate)) Hz, \(loadedChannels) ch"
          + " -> AAC-LC \(kAudioRate) Hz, \(opt.audioChannels) ch, \(audioBitrateUsed) bit/s")
    if opt.audioFit && abs(loadedDuration - videoSeconds) > 0.02 {
        let what = loadedDuration > videoSeconds ? "trimmed" : "padded with silence"
        eprint("encode: note: audio is \(String(format: "%.3f", loadedDuration)) s, video is \(String(format: "%.3f", videoSeconds)) s; audio will be \(what)")
    }
} else {
    print("encode: no audio track")
}

guard writer.startWriting() else {
    die("startWriting failed: \(writer.error?.localizedDescription ?? "unknown") \(String(describing: writer.error))")
}
writer.startSession(atSourceTime: .zero)

guard let pool = adaptor.pixelBufferPool else { die("the pixel buffer pool is not available after startWriting") }
let pipeline = FramePipeline(files: frames, pool: pool, width: opt.width, height: opt.height, lookAhead: opt.jobs)
pipeline.start()

let group = DispatchGroup()
let failLock = NSLock()
nonisolated(unsafe) var failure: String? = nil
func fail(_ s: String) {
    failLock.lock()
    if failure == nil { failure = s }
    failLock.unlock()
}
func hasFailed() -> Bool {
    failLock.lock(); defer { failLock.unlock() }
    return failure != nil
}

// ---- video pump
let videoQueue = DispatchQueue(label: "encode.video")
nonisolated(unsafe) var framesAppended = 0
nonisolated(unsafe) var lastReport = Date()
nonisolated(unsafe) var videoFinished = false
let encodeStart = Date()

group.enter()
videoInput.requestMediaDataWhenReady(on: videoQueue) {
    if videoFinished { return }
    while videoInput.isReadyForMoreMediaData {
        var done = false
        autoreleasepool {
            do {
                if hasFailed() { done = true; return }
                guard let pb = try pipeline.next() else { done = true; return }
                if !adaptor.append(pb, withPresentationTime: pts(framesAppended)) {
                    fail("appending frame \(framesAppended + 1) failed: "
                         + "\(writer.error?.localizedDescription ?? "unknown") \(String(describing: writer.error))")
                    done = true
                    return
                }
                framesAppended += 1
                let now = Date()
                if now.timeIntervalSince(lastReport) >= 1.0 || framesAppended == frameCount {
                    lastReport = now
                    let el = now.timeIntervalSince(encodeStart)
                    let rate = Double(framesAppended) / max(el, 0.001)
                    let eta = Double(frameCount - framesAppended) / max(rate, 0.001)
                    print(String(format: "encode: frame %d/%d (%.1f%%)  %.1f fps  elapsed %.1fs  eta %.1fs",
                                 framesAppended, frameCount,
                                 100.0 * Double(framesAppended) / Double(frameCount), rate, el, eta))
                }
            } catch {
                fail("frame \(framesAppended + 1): \(error)")
                done = true
            }
        }
        if done {
            videoFinished = true
            videoInput.markAsFinished()
            group.leave()
            return
        }
    }
}

// ---- audio pump
if let ai = audioInput, let feeder = audioFeeder {
    let audioQueue = DispatchQueue(label: "encode.audio")
    nonisolated(unsafe) var audioFinished = false
    group.enter()
    ai.requestMediaDataWhenReady(on: audioQueue) {
        if audioFinished { return }
        while ai.isReadyForMoreMediaData {
            var done = false
            autoreleasepool {
                do {
                    if hasFailed() { done = true; return }
                    guard let sb = try feeder.next() else { done = true; return }
                    if !ai.append(sb) {
                        fail("appending audio failed: \(writer.error?.localizedDescription ?? "unknown") \(String(describing: writer.error))")
                        done = true
                    }
                } catch {
                    fail("audio: \(error)")
                    done = true
                }
            }
            if done {
                audioFinished = true
                ai.markAsFinished()
                group.leave()
                return
            }
        }
    }
}

group.wait()

if let f = failure {
    writer.cancelWriting()
    try? FileManager.default.removeItem(at: tmpURL)
    let prefix = tmpURL.lastPathComponent + ".sb-"
    if let names = try? FileManager.default.contentsOfDirectory(atPath: outDir.path) {
        for n in names where n.hasPrefix(prefix) {
            try? FileManager.default.removeItem(at: outDir.appendingPathComponent(n))
        }
    }
    die(f)
}

writer.endSession(atSourceTime: endTime)   // gives the last frame its full duration
let finishSem = DispatchSemaphore(value: 0)
writer.finishWriting { finishSem.signal() }
finishSem.wait()

guard writer.status == .completed else {
    try? FileManager.default.removeItem(at: tmpURL)
    die("finishWriting failed (status \(writer.status.rawValue)): "
        + "\(writer.error?.localizedDescription ?? "unknown") \(String(describing: writer.error))")
}

// With shouldOptimizeForNetworkUse the writer stages the media data in a
// sibling "<tmp>.sb-XXXX" file. It is not always removed before this process
// exits, so remove whatever is left of OUR temp name.
func removeStagingFiles() {
    let prefix = tmpURL.lastPathComponent + ".sb-"
    if let names = try? FileManager.default.contentsOfDirectory(atPath: outDir.path) {
        for n in names where n.hasPrefix(prefix) {
            try? FileManager.default.removeItem(at: outDir.appendingPathComponent(n))
        }
    }
}
removeStagingFiles()

// atomic move into place
do {
    if FileManager.default.fileExists(atPath: outURL.path) {
        _ = try FileManager.default.replaceItemAt(outURL, withItemAt: tmpURL)
    } else {
        try FileManager.default.moveItem(at: tmpURL, to: outURL)
    }
} catch {
    die("cannot move the finished file to \(outURL.path): \(error.localizedDescription) (partial file: \(tmpURL.path))")
}

let encodeSeconds = Date().timeIntervalSince(encodeStart)
let totalSeconds = Date().timeIntervalSince(t0)
let size = ((try? FileManager.default.attributesOfItem(atPath: outURL.path))?[.size] as? NSNumber)?.int64Value ?? 0

if let feeder = audioFeeder {
    let wrote = Double(feeder.framesWritten) / Double(kAudioRate)
    print(String(format: "encode: audio written %.3f s (source read %.3f s, silence padded %.3f s%@)",
                 wrote, Double(feeder.sourceFrames) / Double(kAudioRate),
                 Double(feeder.paddedFrames) / Double(kAudioRate), feeder.trimmed ? ", source TRIMMED" : ""))
}
print(String(format: "encode: done  frames=%d  duration=%.3fs  encode_time=%.2fs  speed=%.1f fps (%.2fx realtime)  total_time=%.2fs",
             framesAppended, videoSeconds, encodeSeconds, Double(framesAppended) / max(encodeSeconds, 0.001),
             videoSeconds / max(encodeSeconds, 0.001), totalSeconds))
print(String(format: "encode: wrote %@  %.2f MB  overall %.2f Mbit/s",
             outURL.path, Double(size) / 1_048_576.0, Double(size) * 8.0 / max(videoSeconds, 0.001) / 1_000_000.0))
exit(0)
