// probe.swift — a small ffprobe replacement built on AVFoundation.
//
//   probe <file> [--frames] [--json]
//
// Prints the container duration and, per track: codec fourcc, dimensions,
// nominal frame rate, estimated bitrate, audio sample rate and channels,
// colour tags, H.264 profile/level and (for MP4/MOV) whether the file is
// fast-start (moov before mdat).
//
// --frames  additionally walks every video sample: sample count, keyframe
//           count, longest keyframe gap, min/max frame duration (constant
//           frame rate check) and the exact bitrate from the sample sizes.
// --json    machine-readable output.

import Foundation
import AVFoundation
import CoreMedia

setvbuf(stdout, nil, _IOLBF, 0)

func eprint(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

func die(_ msg: String) -> Never {
    eprint("probe: ERROR: \(msg)")
    exit(1)
}

func fourcc(_ v: UInt32) -> String {
    let bytes: [UInt8] = [UInt8((v >> 24) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 8) & 0xff), UInt8(v & 0xff)]
    if bytes.allSatisfy({ $0 >= 0x20 && $0 < 0x7f }) {
        return String(bytes: bytes, encoding: .ascii) ?? String(format: "0x%08x", v)
    }
    return String(format: "0x%08x", v)
}

func r3(_ d: Double) -> Double { (d * 1000).rounded() / 1000 }

// ------------------------------------------------ top-level MP4 atom layout

struct Atom { let type: String; let offset: UInt64; let size: UInt64 }

func topLevelAtoms(path: String) -> [Atom] {
    guard let fh = FileHandle(forReadingAtPath: path) else { return [] }
    defer { try? fh.close() }
    let fileSize = (try? fh.seekToEnd()) ?? 0
    var atoms: [Atom] = []
    var off: UInt64 = 0
    while off + 8 <= fileSize && atoms.count < 64 {
        do { try fh.seek(toOffset: off) } catch { break }
        guard let head = try? fh.read(upToCount: 16), head.count >= 8 else { break }
        let b = [UInt8](head)
        var size = UInt64(b[0]) << 24 | UInt64(b[1]) << 16 | UInt64(b[2]) << 8 | UInt64(b[3])
        let typeBytes = Array(b[4..<8])
        guard typeBytes.allSatisfy({ $0 >= 0x20 && $0 < 0x7f }) else { break }
        let type = String(bytes: typeBytes, encoding: .ascii) ?? "????"
        if size == 1 {
            guard b.count >= 16 else { break }
            size = 0
            for i in 8..<16 { size = size << 8 | UInt64(b[i]) }
        } else if size == 0 {
            size = fileSize - off
        }
        if size < 8 { break }
        atoms.append(Atom(type: type, offset: off, size: size))
        off += size
    }
    return atoms
}

// ------------------------------------------------------------------- H.264

func h264ProfileName(_ idc: Int) -> String {
    switch idc {
    case 66: return "Baseline"
    case 77: return "Main"
    case 88: return "Extended"
    case 100: return "High"
    case 110: return "High 10"
    case 122: return "High 4:2:2"
    case 244: return "High 4:4:4 Predictive"
    default: return "profile_idc \(idc)"
    }
}

// --------------------------------------------------------------- arguments

var path: String? = nil
var wantJSON = false
var wantFrames = false
for a in CommandLine.arguments.dropFirst() {
    switch a {
    case "--json": wantJSON = true
    case "--frames": wantFrames = true
    case "-h", "--help":
        print("usage: probe <file> [--frames] [--json]")
        exit(0)
    default:
        if a.hasPrefix("--") { die("unknown option \(a)") }
        if path != nil { die("only one file can be probed at a time") }
        path = a
    }
}
guard let filePath = path else { die("usage: probe <file> [--frames] [--json]") }
guard FileManager.default.fileExists(atPath: filePath) else { die("file not found: \(filePath)") }

let url = URL(fileURLWithPath: filePath)
let fileSize = ((try? FileManager.default.attributesOfItem(atPath: filePath))?[.size] as? NSNumber)?.int64Value ?? 0
let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])

var report: [String: Any] = ["file": filePath, "size_bytes": fileSize]
var text: [String] = []

do {
    let duration = try await asset.load(.duration)
    let tracks = try await asset.load(.tracks)
    let durS = CMTimeGetSeconds(duration)
    report["duration_s"] = r3(durS)
    report["track_count"] = tracks.count
    if durS > 0 { report["overall_bitrate_bps"] = Int(Double(fileSize) * 8.0 / durS) }

    text.append("file: \(filePath)")
    text.append(String(format: "size: %lld bytes (%.2f MB)", fileSize, Double(fileSize) / 1_048_576.0))
    text.append(String(format: "duration: %.3f s", durS))
    if durS > 0 {
        text.append(String(format: "overall_bitrate: %.3f Mbit/s", Double(fileSize) * 8.0 / durS / 1_000_000.0))
    }

    let atoms = topLevelAtoms(path: filePath)
    if let first = atoms.first, first.type == "ftyp" {
        let order = atoms.map { $0.type }
        let moov = order.firstIndex(of: "moov")
        let mdat = order.firstIndex(of: "mdat")
        let fast = (moov != nil && mdat != nil && moov! < mdat!)
        report["atoms"] = order
        report["fast_start"] = fast
        text.append("container_atoms: " + order.joined(separator: " "))
        text.append("fast_start: \(fast ? "yes (moov before mdat)" : "NO")")
    }
    text.append("tracks: \(tracks.count)")
    if tracks.isEmpty {
        eprint("probe: warning: AVFoundation found no tracks (unsupported container or codec?)")
    }

    var trackReports: [[String: Any]] = []
    for (idx, t) in tracks.enumerated() {
        var tr: [String: Any] = ["index": idx, "track_id": Int(t.trackID), "media_type": t.mediaType.rawValue]
        let fds = try await t.load(.formatDescriptions)
        let timeRange = try await t.load(.timeRange)
        let dataRate = try await t.load(.estimatedDataRate)
        let totalBytes = try await t.load(.totalSampleDataLength)
        let tDur = CMTimeGetSeconds(timeRange.duration)
        let tStart = CMTimeGetSeconds(timeRange.start)
        tr["duration_s"] = r3(tDur)
        tr["start_s"] = r3(tStart)
        tr["estimated_bitrate_bps"] = Int(dataRate)
        tr["sample_data_bytes"] = totalBytes
        if tDur > 0 { tr["bitrate_from_sample_data_bps"] = Int(Double(totalBytes) * 8.0 / tDur) }

        text.append("")
        text.append("track \(idx): \(t.mediaType.rawValue == "vide" ? "video" : t.mediaType.rawValue == "soun" ? "audio" : t.mediaType.rawValue)  (id \(t.trackID))")

        guard let fd = fds.first else {
            text.append("  (no format description)")
            trackReports.append(tr)
            continue
        }
        let sub = fourcc(CMFormatDescriptionGetMediaSubType(fd))
        tr["codec_fourcc"] = sub
        let ext = (CMFormatDescriptionGetExtensions(fd) as? [String: Any]) ?? [:]

        if t.mediaType == .video {
            let dims = CMVideoFormatDescriptionGetDimensions(fd)
            let fps = try await t.load(.nominalFrameRate)
            let minFD = try await t.load(.minFrameDuration)
            let natural = try await t.load(.naturalSize)
            tr["width"] = Int(dims.width)
            tr["height"] = Int(dims.height)
            tr["natural_width"] = Int(natural.width)
            tr["natural_height"] = Int(natural.height)
            tr["nominal_fps"] = r3(Double(fps))
            if minFD.isValid && minFD.value > 0 {
                tr["min_frame_duration_s"] = Double(minFD.value) / Double(minFD.timescale)
            }

            var codecLine = "  codec: \(sub)"
            if let atomsExt = ext[kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms as String] as? [String: Any],
               let avcC = atomsExt["avcC"] as? Data, avcC.count >= 4 {
                let profile = Int(avcC[1])
                let level = Int(avcC[3])
                tr["h264_profile_idc"] = profile
                tr["h264_profile"] = h264ProfileName(profile)
                tr["h264_level"] = String(format: "%.1f", Double(level) / 10.0)
                codecLine += String(format: "  (H.264 %@ profile, level %.1f)", h264ProfileName(profile), Double(level) / 10.0)
            }
            text.append(codecLine)
            text.append("  dimensions: \(dims.width)x\(dims.height)")

            var parH = 1, parV = 1
            if let par = ext[kCMFormatDescriptionExtension_PixelAspectRatio as String] as? [String: Any] {
                parH = (par[kCMFormatDescriptionKey_PixelAspectRatioHorizontalSpacing as String] as? NSNumber)?.intValue ?? 1
                parV = (par[kCMFormatDescriptionKey_PixelAspectRatioVerticalSpacing as String] as? NSNumber)?.intValue ?? 1
                tr["pixel_aspect_ratio_tagged"] = true
            } else {
                tr["pixel_aspect_ratio_tagged"] = false
            }
            tr["pixel_aspect_ratio"] = "\(parH):\(parV)"
            text.append("  pixel_aspect_ratio: \(parH):\(parV)\(parH == parV ? " (square)" : "")")
            text.append(String(format: "  nominal_frame_rate: %.3f fps", Double(fps)))
            if minFD.isValid && minFD.value > 0 {
                text.append(String(format: "  min_frame_duration: %lld/%d s (= %.3f fps)", minFD.value, minFD.timescale,
                                   Double(minFD.timescale) / Double(minFD.value)))
            }
            let prim = ext[kCMFormatDescriptionExtension_ColorPrimaries as String] as? String
            let trc = ext[kCMFormatDescriptionExtension_TransferFunction as String] as? String
            let mat = ext[kCMFormatDescriptionExtension_YCbCrMatrix as String] as? String
            let full = (ext[kCMFormatDescriptionExtension_FullRangeVideo as String] as? NSNumber)?.boolValue ?? false
            tr["color_primaries"] = prim ?? "untagged"
            tr["color_transfer"] = trc ?? "untagged"
            tr["color_matrix"] = mat ?? "untagged"
            tr["full_range"] = full
            text.append("  colour: primaries=\(prim ?? "untagged") transfer=\(trc ?? "untagged") matrix=\(mat ?? "untagged") range=\(full ? "full" : "video")")
        } else if t.mediaType == .audio {
            if let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd)?.pointee {
                tr["sample_rate"] = Int(asbd.mSampleRate)
                tr["channels"] = Int(asbd.mChannelsPerFrame)
                tr["bits_per_channel"] = Int(asbd.mBitsPerChannel)
                tr["frames_per_packet"] = Int(asbd.mFramesPerPacket)
                var name = ""
                switch asbd.mFormatID {
                case kAudioFormatMPEG4AAC: name = "  (MPEG-4 AAC-LC, 'mp4a' sample entry)"
                case kAudioFormatLinearPCM: name = "  (linear PCM \(asbd.mBitsPerChannel)-bit)"
                case kAudioFormatMPEG4AAC_HE: name = "  (HE-AAC)"
                default: name = ""
                }
                tr["codec_name"] = name.trimmingCharacters(in: CharacterSet(charactersIn: " ()"))
                text.append("  codec: \(sub)\(name)")
                text.append("  sample_rate: \(Int(asbd.mSampleRate)) Hz")
                text.append("  channels: \(asbd.mChannelsPerFrame)")
            } else {
                text.append("  codec: \(sub)")
            }
        } else {
            text.append("  codec: \(sub)")
        }
        text.append(String(format: "  estimated_bitrate: %.3f Mbit/s (%d bit/s)", Double(dataRate) / 1_000_000.0, Int(dataRate)))
        text.append(String(format: "  duration: %.3f s (start %.3f s)", tDur, tStart))

        // ---- optional per-sample walk
        if wantFrames && t.mediaType == .video {
            let reader = try AVAssetReader(asset: asset)
            let out = AVAssetReaderTrackOutput(track: t, outputSettings: nil)
            out.alwaysCopiesSampleData = false
            reader.add(out)
            guard reader.startReading() else {
                die("cannot read samples: \(reader.error?.localizedDescription ?? "unknown")")
            }
            var ptsList: [Double] = []
            var keyPts: [Double] = []
            var bytes: Int64 = 0
            var maxFrameBytes = 0
            while let sb = out.copyNextSampleBuffer() {
                autoreleasepool {
                    let n = CMSampleBufferGetNumSamples(sb)
                    if n == 0 { return }
                    let p = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
                    let sz = CMSampleBufferGetTotalSampleSize(sb)
                    bytes += Int64(sz)
                    maxFrameBytes = max(maxFrameBytes, sz)
                    var isKey = true
                    if let arr = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]],
                       let first = arr.first,
                       let notSync = first[kCMSampleAttachmentKey_NotSync] as? Bool {
                        isKey = !notSync
                    }
                    ptsList.append(p)
                    if isKey { keyPts.append(p) }
                }
            }
            if reader.status == .failed {
                die("sample walk failed: \(reader.error?.localizedDescription ?? "unknown")")
            }
            ptsList.sort()
            keyPts.sort()
            var minD = Double.greatestFiniteMagnitude, maxD = 0.0
            if ptsList.count > 1 {
                for i in 1..<ptsList.count {
                    let d = ptsList[i] - ptsList[i - 1]
                    minD = min(minD, d); maxD = max(maxD, d)
                }
            } else { minD = 0 }
            var maxGap = 0.0
            if !keyPts.isEmpty {
                for i in 1..<max(1, keyPts.count) where keyPts.count > 1 {
                    maxGap = max(maxGap, keyPts[i] - keyPts[i - 1])
                }
                let endS = tStart + tDur
                maxGap = max(maxGap, endS - keyPts.last!)
            }
            let cfr = ptsList.count > 1 && (maxD - minD) < 0.0005
            tr["sample_count"] = ptsList.count
            tr["keyframe_count"] = keyPts.count
            tr["max_keyframe_gap_s"] = r3(maxGap)
            tr["min_frame_interval_s"] = minD
            tr["max_frame_interval_s"] = maxD
            tr["constant_frame_rate"] = cfr
            tr["first_pts_s"] = ptsList.first ?? 0
            tr["last_pts_s"] = ptsList.last ?? 0
            tr["max_frame_bytes"] = maxFrameBytes
            if tDur > 0 { tr["exact_bitrate_bps"] = Int(Double(bytes) * 8.0 / tDur) }
            text.append("  samples: \(ptsList.count)")
            text.append(String(format: "  first_pts: %.4f s   last_pts: %.4f s", ptsList.first ?? 0, ptsList.last ?? 0))
            text.append(String(format: "  frame_interval: min %.5f s  max %.5f s  -> %@", minD, maxD,
                               cfr ? "constant frame rate" : "VARIABLE frame rate"))
            text.append(String(format: "  keyframes: %d   longest keyframe gap: %.3f s", keyPts.count, maxGap))
            if tDur > 0 {
                text.append(String(format: "  exact_bitrate: %.3f Mbit/s (from %lld bytes of samples)",
                                   Double(bytes) * 8.0 / tDur / 1_000_000.0, bytes))
            }
        }
        trackReports.append(tr)
    }
    report["tracks"] = trackReports
} catch {
    die("cannot read \(filePath): \(error.localizedDescription) (\(error))")
}

if wantJSON {
    let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
    print(String(data: data, encoding: .utf8)!)
} else {
    print(text.joined(separator: "\n"))
}
exit(0)
