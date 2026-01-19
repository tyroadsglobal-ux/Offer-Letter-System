const { PDFDocument, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function generateOfferPDF(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { name, position, salary } = data;

  let y = 780;
  const draw = (text) => {
    page.drawText(text, { x: 50, y, size: 12, font });
    y -= 25;
  };

  draw("OFFER LETTER");
  y -= 20;

  draw(`Company: TYROADS`);
  draw(`Location: Gwalior`);
  y -= 20;

  draw(`Candidate Name: ${name}`);
  draw(`Position: ${position}`);
  draw(`Salary: ${salary} per month`);
  y -= 20;

  draw("Terms & Conditions:");
  draw("- Working hours as per company policy");
  draw("- Confidentiality must be maintained");
  draw("- Salary credited monthly");
  y -= 20;

  draw("Please login to the portal to accept or reject this offer.");

  const pdfBytes = await pdfDoc.save();

  const fileName = `offer_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, "../uploads", fileName);
  fs.writeFileSync(filePath, pdfBytes);

  return filePath;
}

module.exports = generateOfferPDF;
