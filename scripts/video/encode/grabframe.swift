// grabframe.swift — extract exactly one frame of a video as PNG.
//
//   grabframe <video> <seconds> <out.png> [--scale WxH]
//
// Uses AVAssetImageGenerator with time tolerance zero, so the frame returned
// is the one that is on screen at <seconds> (frame-accurate, not the nearest
// keyframe). Prints the requested and the actual time.

import Foundation
import AVFoundation
import CoreMedia
import CoreGraphics
import ImageIO

setvbuf(stdout, nil, _IOLBF, 0)

func die(_ msg: String) -> Never {
    FileHandle.standardError.write(("grabframe: ERROR: \(msg)\n").data(using: .utf8)!)
    exit(1)
}

let usage = "usage: grabframe <video> <seconds> <out.png> [--scale WxH]"

var pos: [String] = []
var maxSize: CGSize? = nil
var it = CommandLine.arguments.dropFirst().makeIterator()
while let a = it.next() {
    switch a {
    case "-h", "--help":
        print(usage); exit(0)
    case "--scale":
        guard let v = it.next() else { die("--scale needs WxH") }
        let p = v.lowercased().split(separator: "x")
        guard p.count == 2, let w = Int(p[0]), let h = Int(p[1]), w > 0, h > 0 else { die("--scale needs WxH") }
        maxSize = CGSize(width: w, height: h)
    default:
        if a.hasPrefix("--") { die("unknown option \(a)\n\(usage)") }
        pos.append(a)
    }
}
guard pos.count == 3 else { die(usage) }
let videoPath = pos[0]
guard let seconds = Double(pos[1]), seconds >= 0 else { die("cannot parse seconds '\(pos[1])'") }
let outPath = pos[2]
guard FileManager.default.fileExists(atPath: videoPath) else { die("file not found: \(videoPath)") }

let asset = AVURLAsset(url: URL(fileURLWithPath: videoPath),
                       options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
do {
    let tracks = try await asset.loadTracks(withMediaType: .video)
    guard let track = tracks.first else { die("no video track in \(videoPath)") }
    let range = try await track.load(.timeRange)
    let fps = Double(try await track.load(.nominalFrameRate))
    let end = CMTimeGetSeconds(range.end)

    var t = seconds
    if fps > 0 && t > end - 0.5 / fps {
        let clamped = max(0, end - 0.5 / fps)
        FileHandle.standardError.write(
            String(format: "grabframe: note: %.3f s is past the last frame; using %.3f s\n", t, clamped).data(using: .utf8)!)
        t = clamped
    }

    let gen = AVAssetImageGenerator(asset: asset)
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    gen.appliesPreferredTrackTransform = true
    if let m = maxSize { gen.maximumSize = m }

    // 90 kHz has exact representations for 1/24, 1/25, 1/30, 1/50, 1/60 s.
    let req = CMTime(value: CMTimeValue((t * 90_000).rounded()), timescale: 90_000)
    let result = try await gen.image(at: req)
    let img = result.image
    let actual = CMTimeGetSeconds(result.actualTime)

    let outURL = URL(fileURLWithPath: outPath)
    try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, "public.png" as CFString, 1, nil) else {
        die("cannot create \(outPath)")
    }
    CGImageDestinationAddImage(dest, img, nil)
    guard CGImageDestinationFinalize(dest) else { die("cannot write \(outPath)") }

    let frameIndex = fps > 0 ? Int((actual * fps).rounded()) : -1
    print(String(format: "grabframe: requested %.4f s  actual %.4f s  frame_index %d (0-based, at %.3f fps)  %dx%d  -> %@",
                 t, actual, frameIndex, fps, img.width, img.height, outPath))
} catch {
    die("cannot extract frame: \(error.localizedDescription) (\(error))")
}
exit(0)
