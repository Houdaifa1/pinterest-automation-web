// Renders a 2:3 test pin image (labelled as a Pinterest Autopilot test).
// Usage: swift make_test_pin.swift "<headline>" "<subline>" <out.jpg|png> <hue 0-1> [width height]
import AppKit

let a = CommandLine.arguments
let headline = a.count > 1 ? a[1] : "Test pin"
let subline = a.count > 2 ? a[2] : ""
let out = a.count > 3 ? a[3] : "pin.jpg"
let hue = a.count > 4 ? CGFloat(Double(a[4]) ?? 0.95) : 0.95
let w = a.count > 5 ? Int(a[5]) ?? 1000 : 1000
let h = a.count > 6 ? Int(a[6]) ?? 1500 : 1500

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let W = CGFloat(w), H = CGFloat(h)
NSGradient(starting: NSColor(calibratedHue: hue, saturation: 0.45, brightness: 0.97, alpha: 1),
           ending: NSColor(calibratedHue: fmod(hue + 0.07, 1), saturation: 0.7, brightness: 0.5, alpha: 1))!
  .draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)
for i in 0..<6 {
  let r = CGFloat(60 + i * 40)
  NSColor(white: 1, alpha: 0.08).setFill()
  NSBezierPath(ovalIn: NSRect(x: W * 0.72 - r / 2 + CGFloat(i * 9), y: H * 0.82 - r / 2, width: r, height: r)).fill()
}
let card = NSRect(x: W * 0.08, y: H * 0.26, width: W * 0.84, height: H * 0.48)
NSColor(white: 1, alpha: 0.93).setFill()
NSBezierPath(roundedRect: card, xRadius: 36, yRadius: 36).fill()
let p = NSMutableParagraphStyle(); p.alignment = .center; p.lineBreakMode = .byWordWrapping
let h1: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: W * 0.075), .foregroundColor: NSColor(white: 0.1, alpha: 1), .paragraphStyle: p]
let h2: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: W * 0.04), .foregroundColor: NSColor(white: 0.32, alpha: 1), .paragraphStyle: p]
let tag: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: W * 0.03), .foregroundColor: NSColor(calibratedHue: hue, saturation: 0.8, brightness: 0.6, alpha: 1), .paragraphStyle: p]
("PINTEREST AUTOPILOT · TEST" as NSString).draw(in: NSRect(x: card.minX + 40, y: card.maxY - 110, width: card.width - 80, height: 60), withAttributes: tag)
(headline as NSString).draw(in: NSRect(x: card.minX + 50, y: card.minY + card.height * 0.36, width: card.width - 100, height: card.height * 0.42), withAttributes: h1)
(subline as NSString).draw(in: NSRect(x: card.minX + 50, y: card.minY + 40, width: card.width - 100, height: card.height * 0.3), withAttributes: h2)
NSGraphicsContext.restoreGraphicsState()
let isPng = out.lowercased().hasSuffix(".png")
let data = rep.representation(using: isPng ? .png : .jpeg, properties: isPng ? [:] : [.compressionFactor: 0.72])!
try! data.write(to: URL(fileURLWithPath: out))
print("\(out) \(data.count)")
