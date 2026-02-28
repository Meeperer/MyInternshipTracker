import PDFDocument from 'pdfkit';
import { TARGET_HOURS } from '../../shared/constants.js';

export function generateCompiledPDF(reportData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const RED = '#BE3519';
    const CREAM = '#FDFFE4';
    const DARK = '#1e1e1e';

    doc.rect(0, 0, doc.page.width, doc.page.height).fill(CREAM);

    doc.moveDown(6);
    doc.fontSize(32).fillColor(RED).text('INTERNSHIP JOURNAL', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(DARK).text('Compiled Report', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12).fillColor(DARK);
    doc.text(`Name: ${reportData.userName || 'N/A'}`, { align: 'center' });
    doc.text(`Company: ${reportData.company || 'N/A'}`, { align: 'center' });
    doc.moveDown(1);
    doc.text(`Date Range: ${reportData.dateRangeStart} — ${reportData.dateRangeEnd}`, { align: 'center' });
    doc.text(`Total Hours: ${reportData.totalHours} / ${TARGET_HOURS}`, { align: 'center' });
    doc.text(`Total Days: ${reportData.totalDays}`, { align: 'center' });

    const entries = reportData.entries || [];

    for (const entry of entries) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(CREAM);

      const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      doc.fontSize(16).fillColor(RED).text(dateStr, 72, 72);
      doc.fontSize(10).fillColor(DARK).text(`Hours Rendered: ${entry.hours}`, 72, doc.y + 8);
      doc.moveDown(1.5);

      const sections = [
        { title: 'Action', content: entry.aras_action },
        { title: 'Reflection', content: entry.aras_reflection },
        { title: 'Analysis', content: entry.aras_analysis },
        { title: 'Summary', content: entry.aras_summary }
      ];

      for (const section of sections) {
        if (section.content) {
          doc.fontSize(12).fillColor(RED).text(section.title);
          doc.moveDown(0.3);
          doc.fontSize(10).fillColor(DARK).text(section.content, { lineGap: 4 });
          doc.moveDown(1);
        }
      }
    }

    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(CREAM);

    doc.fontSize(20).fillColor(RED).text('Final Summary', 72, 72);
    doc.moveDown(1.5);

    doc.fontSize(12).fillColor(DARK);
    doc.text(`Total Hours Completed: ${reportData.totalHours}`);
    doc.text(`Total Working Days: ${reportData.totalDays}`);
    doc.text(`Period: ${reportData.dateRangeStart} to ${reportData.dateRangeEnd}`);
    doc.moveDown(2);

    doc.fontSize(10).fillColor(DARK).text(
      `This internship journal was compiled automatically upon reaching the required ${TARGET_HOURS} hours. ` +
      'All entries have been reviewed and finalized by the intern.',
      { lineGap: 4 }
    );

    doc.end();
  });
}
