export async function createExcelBuffer(report) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const book = new ExcelJS.Workbook();
  book.creator = 'AAST Finance';
  book.created = new Date(report.generatedAt);
  const names = {
    courses: 'Courses',
    tuition: 'Student Tuition',
    payroll: 'Instructor Payroll'
  };
  for (const data of report.sheets) {
    const sheet = book.addWorksheet(names[data.key]);
    sheet.columns = data.columns.map(column => ({
      header: column.label,
      key: column.key,
      width: Math.min(45, Math.max(18, column.label.length + 3))
    }));
    for (const values of data.rows) {
      // ExcelJS string values are literal cells, never formula objects or hyperlinks.
      const row = sheet.addRow(data.columns.map(column => values[column.key] ?? ''));
      row.eachCell(cell => {
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.00;[Red](#,##0.00)';
      });
    }
    sheet.views = [{
      state: 'frozen',
      ySplit: 1
    }];
    sheet.autoFilter = {
      from: {
        row: 1,
        column: 1
      },
      to: {
        row: Math.max(1, sheet.rowCount),
        column: data.columns.length
      }
    };
    sheet.getRow(1).font = {
      bold: true,
      color: {
        argb: 'FFFFFFFF'
      }
    };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FF25385C'
      }
    };
    sheet.getRow(1).height = 28;
  }
  const info = book.addWorksheet('Export Notes');
  info.columns = [{
    width: 26
  }, {
    width: 95
  }];
  info.addRow(['AAST Finance', 'Export details']);
  info.addRow(['Generated (UTC)', report.generatedAt]);
  for (const [key, value] of Object.entries(report.filters)) if (value !== '' && value !== false) info.addRow([key, String(value)]);
  info.addRow(['Dates', 'Courses: course start date, or creation date when start date is unset. Tuition: enrollment date. Payroll: payroll month (inclusive months).']);
  info.addRow(['Course tuition totals', 'Retained financial records count even when the student/enrollment is removed. Archived finances do not count.']);
  info.addRow(['Student counts', 'Active visible enrollments only. Totals can include retained financial records omitted from a junior roster.']);
  info.addRow(['Tuition status filter', 'Filters tuition rows; Courses includes courses with at least one matching visible enrollment. Course totals remain whole-course totals.']);
  info.addRow(['Payroll', 'Completed payroll snapshots, including reopened courses; earned amounts, not a record of interim cash payments.']);
  info.addRow(['Archives', 'Excluded unless requested by a manager. Archived tuition rows are labelled and excluded from course totals.']);
  info.addRow(['Worksheets', report.sheets.map(s => `${names[s.key]}: ${s.rows.length} rows`).join('; ')]);
  info.eachRow(row => {
    row.alignment = {
      vertical: 'top',
      wrapText: true
    };
    row.height = 44;
  });
  return book.xlsx.writeBuffer();
}
export function downloadExcel(buffer) {
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `aast-finance-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
