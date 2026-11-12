// On-device text recognition with Apple's Vision framework (no network, no account).
// Usage: jabboo-pay-ocr <image>  -> recognised lines on stdout, top to bottom.
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("cannot read image\n".data(using: .utf8)!)
  exit(2)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["de-DE", "en-US"]
do {
  try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
} catch {
  FileHandle.standardError.write("recognition failed\n".data(using: .utf8)!)
  exit(3)
}
let lines = (request.results ?? [])
  .sorted { $0.boundingBox.minY > $1.boundingBox.minY }
  .compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
