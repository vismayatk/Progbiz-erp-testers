// yuvpeek.swift — diagnostic: mean Y / Cb / Cr of a region of one decoded frame.
//
//   yuvpeek <video> <seconds> <x> <y> <w> <h> [more x y w h ...]
//
// Decodes with AVAssetReader straight to the native 4:2:0 video-range buffer
// (no RGB conversion, no colour management), so it shows what the encoder
// actually stored. Used by the selftest to verify levels.

import Foundation
import AVFoundation
import CoreMedia
import CoreVideo

func die(_ msg: String) -> Never {
    FileHandle.standardError.write(("yuvpeek: ERROR: \(msg)\n").data(using: .utf8)!)
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 6, (args.count - 2) % 4 == 0, let seconds = Double(args[1]) else {
    die("usage: yuvpeek <video> <seconds> <x> <y> <w> <h> [x y w h ...]")
}
var boxes: [(Int, Int, Int, Int)] = []
var i = 2
while i + 3 < args.count {
    guard let x = Int(args[i]), let y = Int(args[i + 1]), let w = Int(args[i + 2]), let h = Int(args[i + 3]) else {
        die("boxes must be integers")
    }
    boxes.append((x, y, w, h))
    i += 4
}

let asset = AVURLAsset(url: URL(fileURLWithPath: args[0]), options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
do {
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { die("no video track") }
    let duration = try await asset.load(.duration)
    let reader = try AVAssetReader(asset: asset)
    let out = AVAssetReaderTrackOutput(track: track, outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    let start = CMTime(value: CMTimeValue((seconds * 90_000).rounded()), timescale: 90_000)
    reader.timeRange = CMTimeRange(start: start, end: duration)
    reader.add(out)
    guard reader.startReading() else { die("cannot start reading: \(reader.error?.localizedDescription ?? "unknown")") }
    guard let sb = out.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) else { die("no frame decoded") }
    let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
    print(String(format: "yuvpeek: frame pts %.4f s  %dx%d  format %@", pts,
                 CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb),
                 CVPixelBufferGetPixelFormatType(pb) == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange ? "420v (video range)" : "other"))
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let yBase = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
    let yStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
    let cBase = CVPixelBufferGetBaseAddressOfPlane(pb, 1)!.assumingMemoryBound(to: UInt8.self)
    let cStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 1)
    for (x, y, w, h) in boxes {
        var ySum = 0.0, cbSum = 0.0, crSum = 0.0
        var yMin = 255, yMax = 0
        for r in y..<(y + h) {
            for c in x..<(x + w) {
                let v = Int(yBase[r * yStride + c])
                ySum += Double(v); yMin = min(yMin, v); yMax = max(yMax, v)
            }
        }
        var n = 0
        for r in (y / 2)..<((y + h) / 2) {
            for c in (x / 2)..<((x + w) / 2) {
                cbSum += Double(cBase[r * cStride + 2 * c])
                crSum += Double(cBase[r * cStride + 2 * c + 1])
                n += 1
            }
        }
        print(String(format: "  box %4d,%4d %3dx%-3d  Y mean %.2f (min %d max %d)  Cb %.2f  Cr %.2f",
                     x, y, w, h, ySum / Double(w * h), yMin, yMax, cbSum / Double(max(n, 1)), crSum / Double(max(n, 1))))
    }
} catch {
    die("\(error)")
}
exit(0)
