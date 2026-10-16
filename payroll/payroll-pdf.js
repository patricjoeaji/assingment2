const PDFDocument = require('pdfkit');

function formatPayslipDate(value) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatPayslipHours(minutes) {
  return `${Number((minutes / 60).toFixed(2))} hr`;
}

function formatPayslipCurrency(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD'
  }).format(value);
}

function createPayslipPdfBuffer(payslip) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const margin = document.page.margins.left;
    const columns = [
      { title: 'Description', x: margin, width: 210, align: 'left' },
      { title: 'Date', x: margin + 214, width: 82, align: 'left' },
      { title: 'Hours', x: margin + 300, width: 48, align: 'right' },
      { title: 'Rate', x: margin + 352, width: 64, align: 'right' },
      { title: 'Amount', x: margin + 420, width: 78, align: 'right' }
    ];

    document.font('Helvetica-Bold').fontSize(22).text('Payslip');
    document.moveDown(0.4);
    document.font('Helvetica').fontSize(11)
      .text(`Worker: ${payslip.worker.name}`)
      .text(`Email: ${payslip.worker.email}`)
      .text(`Pay period: ${formatPayslipDate(payslip.week.start)} - ${formatPayslipDate(payslip.week.end)}`);

    let y = document.y + 22;
    const drawTableHeader = () => {
      document.font('Helvetica-Bold').fontSize(9);
      columns.forEach(column => document.text(column.title, column.x, y, {
        width: column.width,
        align: column.align
      }));
      y += 18;
      document.moveTo(margin, y).lineTo(document.page.width - margin, y).stroke('#d8c9bc');
      y += 6;
    };

    drawTableHeader();
    document.font('Helvetica').fontSize(9);
    payslip.jobs.forEach(job => {
      const descriptionHeight = document.heightOfString(job.title, { width: columns[0].width });
      const dateLabel = formatPayslipDate(job.date);
      const dateHeight = document.heightOfString(dateLabel, { width: columns[1].width });
      const rowHeight = Math.max(24, descriptionHeight, dateHeight) + 8;

      if (y + rowHeight > document.page.height - document.page.margins.bottom - 130) {
        document.addPage();
        y = document.page.margins.top;
        drawTableHeader();
        document.font('Helvetica').fontSize(9);
      }

      document.text(job.title, columns[0].x, y, { width: columns[0].width });
      document.text(dateLabel, columns[1].x, y, { width: columns[1].width });
      document.text(formatPayslipHours(job.minutes), columns[2].x, y, {
        width: columns[2].width,
        align: columns[2].align
      });
      document.text(formatPayslipCurrency(job.rate ?? payslip.rate), columns[3].x, y, {
        width: columns[3].width,
        align: columns[3].align
      });
      document.text(formatPayslipCurrency(job.amount), columns[4].x, y, {
        width: columns[4].width,
        align: columns[4].align
      });
      y += rowHeight;
      document.moveTo(margin, y).lineTo(document.page.width - margin, y).stroke('#eee5dc');
      y += 7;
    });

    const summaryColumns = [
      { title: '', width: 45, align: 'left' },
      { title: 'Hours', width: 55, align: 'right' },
      { title: 'Rate/hr', width: 65, align: 'right' },
      { title: 'Super 12%', width: 76, align: 'right' },
      { title: 'Gross', width: 70, align: 'right' },
      { title: 'Tax', width: 55, align: 'right' },
      { title: 'Net Pay', width: 72, align: 'right' }
    ];
    const current = payslip.current || payslip;
    const ytd = payslip.ytd || current;
    const summaryRows = [
      [
        'Current',
        formatPayslipHours(current.minutes),
        `${formatPayslipCurrency(current.rate)}/hr`,
        formatPayslipCurrency(current.superAmount),
        formatPayslipCurrency(current.gross),
        formatPayslipCurrency(current.tax),
        formatPayslipCurrency(current.netPay)
      ],
      [
        'YTD',
        formatPayslipHours(ytd.minutes),
        `${formatPayslipCurrency(ytd.rate)}/hr`,
        formatPayslipCurrency(ytd.superAmount),
        formatPayslipCurrency(ytd.gross),
        formatPayslipCurrency(ytd.tax),
        formatPayslipCurrency(ytd.netPay)
      ]
    ];

    if (y + 70 > document.page.height - document.page.margins.bottom) {
      document.addPage();
      y = document.page.margins.top;
    }
    y += 14;
    document.font('Helvetica-Bold').fontSize(14).text('Summary', margin, y);
    y += 24;
    let x = margin;
    document.font('Helvetica-Bold').fontSize(8);
    summaryColumns.forEach(column => {
      document.text(column.title, x, y, { width: column.width, align: column.align });
      x += column.width;
    });
    y += 16;
    summaryRows.forEach((row, rowIndex) => {
      x = margin;
      row.forEach((value, index) => {
        document.font(index === 0 || index === row.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .text(value, x, y, { width: summaryColumns[index].width, align: summaryColumns[index].align });
        x += summaryColumns[index].width;
      });
      y += 18;
      if (rowIndex === 0) {
        document.moveTo(margin, y - 4).lineTo(document.page.width - margin, y - 4).stroke('#eee5dc');
      }
    });

    document.moveDown(0.6);
    document.font('Helvetica').fontSize(8).fillColor('#71665d')
      .text('Tax estimate uses Australian resident rates and excludes the Medicare levy and offsets.', margin, document.y, {
        width: document.page.width - margin * 2
      });

    document.end();
  });
}

module.exports = {
  createPayslipPdfBuffer,
  formatPayslipCurrency,
  formatPayslipDate
};
