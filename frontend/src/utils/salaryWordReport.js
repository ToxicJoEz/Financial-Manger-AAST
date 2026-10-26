import {salaryReportTitle} from './salaryReportTitle';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, VerticalAlign, TableLayoutType, BorderStyle } from 'docx';

// Native, editable Word table using the same paid salary rows as the PDF.
export async function createSalaryWordReport(instructors, month) {
  const cell = (text, width, header = false, shaded = false) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 150, bottom: 150, left: 150, right: 150 },
    shading: { fill: header ? '0F172A' : shaded ? 'F8FAFC' : 'FFFFFF' },
    children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: String(text), rightToLeft: true, bold: header, color: header ? 'FFFFFF' : '000000', font: 'Arial', size: 21 })] })]
  });
  // Letter width minus the same half-inch margins used by the PDF.
  const pageWidth = 12240, margin = 720, contentWidth = pageWidth - margin * 2;
  const widths = [1080, 4320, 2160, 3240]; // PDF column proportions: 10 / 40 / 20 / 30.
  const border = { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' };
  const rows = [new TableRow({ tableHeader: true, children: ['م', 'الأسم', 'الرقم الوظيفي', 'المبلغ بالجنيه المصري'].map((text, i) => cell(text, widths[i], true)) }),
    ...instructors.filter(row => row.totalPaid > 0).map((row, index) => new TableRow({ cantSplit: true, children: [index + 1, row.name, row.employeeId || '-', row.totalPaid.toLocaleString() + ' جنيهاً'].map((text, i) => cell(text, widths[i], false, index % 2 === 1)) }))];
  const document = new Document({ styles: { default: { document: { run: { font: 'Arial', size: 21 } } } }, sections: [{
    properties: { page: { size: { width: pageWidth, height: 15840 }, margin: { top: margin, bottom: margin, left: margin, right: margin } } },
    children: [new Paragraph({ heading: HeadingLevel.TITLE, bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: salaryReportTitle(month), bold: true, color: '000000', size: 32, font: 'Arial', rightToLeft: true })] }),
      new Table({ visuallyRightToLeft: true, alignment: AlignmentType.CENTER, layout: TableLayoutType.FIXED, width: { size: contentWidth, type: WidthType.DXA }, columnWidths: widths, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }, rows })]
  }] });
  return Packer.toBlob(document);
}
