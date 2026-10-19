// Writes a short vertical H.264 MP4 test video (labelled as a Pinterest Autopilot test).
// Usage: swift make_test_video.swift <out.mp4> [seconds] [width] [height]
import AVFoundation
import AppKit

let a = CommandLine.arguments
let out = URL(fileURLWithPath: a.count > 1 ? a[1] : "test.mp4")
let seconds = a.count > 2 ? Double(a[2]) ?? 6 : 6
let w = a.count > 3 ? Int(a[3]) ?? 1080 : 1080
let h = a.count > 4 ? Int(a[4]) ?? 1920 : 1920
let fps: Int32 = 30
try? FileManager.default.removeItem(at: out)

let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 900_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let frames = Int(seconds * Double(fps))
for i in 0..<frames {
  while !input.isReadyForMoreMediaData { usleep(1000) }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  let buf = pb!
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(),
                      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  let t = CGFloat(i) / CGFloat(frames)
  let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = ns
  NSGradient(starting: NSColor(calibratedHue: 0.06 + 0.05 * t, saturation: 0.55, brightness: 0.98, alpha: 1),
             ending: NSColor(calibratedHue: 0.95, saturation: 0.7, brightness: 0.45, alpha: 1))!
    .draw(in: NSRect(x: 0, y: 0, width: w, height: h), angle: -90)
  let r = CGFloat(220 + 80 * sin(t * .pi * 2))
  NSColor(white: 1, alpha: 0.18).setFill()
  NSBezierPath(ovalIn: NSRect(x: CGFloat(w) * t - r / 2, y: CGFloat(h) * 0.7 - r / 2, width: r, height: r)).fill()
  let p = NSMutableParagraphStyle(); p.alignment = .center
  ("PINTEREST AUTOPILOT · TEST" as NSString).draw(in: NSRect(x: 60, y: CGFloat(h) * 0.52, width: CGFloat(w) - 120, height: 60),
    withAttributes: [.font: NSFont.boldSystemFont(ofSize: 40), .foregroundColor: NSColor.white, .paragraphStyle: p])
  ("Video pin" as NSString).draw(in: NSRect(x: 60, y: CGFloat(h) * 0.42, width: CGFloat(w) - 120, height: 130),
    withAttributes: [.font: NSFont.boldSystemFont(ofSize: 110), .foregroundColor: NSColor.white, .paragraphStyle: p])
  (String(format: "%.1f s", Double(i) / Double(fps)) as NSString).draw(in: NSRect(x: 60, y: CGFloat(h) * 0.34, width: CGFloat(w) - 120, height: 80),
    withAttributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 56, weight: .medium), .foregroundColor: NSColor(white: 1, alpha: 0.85), .paragraphStyle: p])
  NSGraphicsContext.restoreGraphicsState()
  CVPixelBufferUnlockBaseAddress(buf, [])
  adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
let size = (try? FileManager.default.attributesOfItem(atPath: out.path)[.size] as? Int) ?? 0
print("\(out.lastPathComponent) \(size) bytes, status \(writer.status.rawValue)")
