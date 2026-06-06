import * as XLSX from "xlsx";

export interface ExportRow {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  separator?: boolean;
}

export interface ExportSection {
  title: string;
  rows: ExportRow[];
}

export interface ExportMeta {
  reportTitle: string;
  company: string;
  dateLabel: string;
  generatedOn: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildMeta(reportTitle: string, asOf?: string, from?: string, to?: string): ExportMeta {
  const dateLabel = asOf
    ? `As at: ${formatDate(asOf)}`
    : `${from ? formatDate(from) : ""} to ${to ? formatDate(to) : ""}`;
  return {
    reportTitle,
    company: "তাল মিসরি ফ্যাক্টরি",
    dateLabel,
    generatedOn: new Date().toLocaleString("en-GB"),
  };
}

function logoUrl() {
  return window.location.origin + "/logo.png";
}

function buildPrintHTML(meta: ExportMeta, sections: ExportSection[]): string {
  const sectionsHtml = sections.map(sec => {
    const rowsHtml = sec.rows.map(row => {
      if (row.separator) {
        return `<tr><td colspan="2" style="padding:3px 0;border:none;"></td></tr>`;
      }
      const rowStyle = row.bold ? "font-weight:700;" : "";
      const labelStyle = row.indent ? "padding:5px 12px 5px 30px;color:#555;" : "padding:5px 12px;";
      return `<tr style="${rowStyle}">
        <td style="${labelStyle}">${row.label}</td>
        <td style="padding:5px 12px;text-align:right;font-variant-numeric:tabular-nums;">${row.value}</td>
      </tr>`;
    }).join("");

    return `
      <div style="margin-bottom:24px;">
        <div style="background:#f0f0f0;padding:7px 12px;font-weight:700;font-size:12.5px;border-left:4px solid #444;letter-spacing:0.02em;">
          ${sec.title}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          ${rowsHtml}
        </table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
  <title>${meta.reportTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', Arial, sans-serif;
      margin: 0; padding: 28px 36px; color: #111; font-size: 13px; line-height: 1.5;
    }
    .header {
      text-align: center; margin-bottom: 24px;
      border-bottom: 2px solid #333; padding-bottom: 14px;
    }
    .company { font-size: 19px; font-weight: 700; }
    .report-title { font-size: 14px; margin-top: 4px; font-weight: 600; }
    .meta { font-size: 11px; color: #666; margin-top: 3px; }
    tr:nth-child(even) { background: #f9f9f9; }
    .footer {
      text-align: center; font-size: 9px; color: #aaa;
      margin-top: 36px; border-top: 1px solid #ddd; padding-top: 8px;
    }
    .print-btn {
      display: block; margin: 24px auto 8px; padding: 10px 36px;
      background: #222; color: #fff; border: none; cursor: pointer;
      font-size: 14px; border-radius: 5px;
      font-family: 'Hind Siliguri', Arial, sans-serif;
    }
    @media print {
      .print-btn { display: none; }
      body { padding: 0; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl()}" style="height:72px;width:auto;display:block;margin:0 auto 8px;" alt="logo" onerror="this.style.display='none'">
    <div class="company">${meta.company}</div>
    <div class="report-title">${meta.reportTitle}</div>
    <div class="meta">${meta.dateLabel}</div>
    <div class="meta">তৈরি: ${meta.generatedOn}</div>
  </div>
  ${sectionsHtml}
  <div class="footer">Confidential — Internal Use Only</div>
  <button class="print-btn" onclick="window.print()">🖨️ প্রিন্ট / PDF সেভ করুন</button>
  <script>
    document.fonts.ready.then(function() {
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`;
}

export function exportPDF(meta: ExportMeta, sections: ExportSection[], _filename: string) {
  const html = buildPrintHTML(meta, sections);
  const win = window.open("", "_blank", "width=860,height=1000,scrollbars=yes,resizable=yes");
  if (!win) {
    alert("পপআপ ব্লক হয়েছে। ব্রাউজার সেটিংসে পপআপ চালু করুন।");
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ── General Ledger columnar export ────────────────────────────────────────────

export interface GLRow {
  date: string;
  voucherNo: string;
  voucherType: string;
  account: string;
  narration: string;
  debit: number;
  credit: number;
  runningBalance?: number;
}

function buildGLPrintHTML(meta: ExportMeta, rows: GLRow[]): string {
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const fmt = (n: number) => n > 0 ? n.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "";

  const rowsHtml = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.voucherNo}</td>
      <td>${r.voucherType}</td>
      <td>${r.account}</td>
      <td>${r.narration}</td>
      <td style="text-align:right">${fmt(r.debit)}</td>
      <td style="text-align:right">${fmt(r.credit)}</td>
      ${r.runningBalance != null ? `<td style="text-align:right">${r.runningBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>` : "<td></td>"}
    </tr>`).join("");

  const totalsHtml = `
    <tr style="font-weight:700;border-top:2px solid #333;background:#f0f0f0;">
      <td colspan="5" style="text-align:right">মোট</td>
      <td style="text-align:right">${totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right">${totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      <td></td>
    </tr>
    ${!balanced ? `<tr><td colspan="8" style="color:red;font-weight:700;text-align:center">⚠ ডেবিট ≠ ক্রেডিট — পার্থক্য: ${Math.abs(totalDebit - totalCredit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>` : ""}`;

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
  <title>${meta.reportTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Hind Siliguri', Arial, sans-serif; margin: 0; padding: 20px 28px; font-size: 11px; color: #111; }
    .header { text-align:center; margin-bottom:16px; border-bottom:2px solid #333; padding-bottom:12px; }
    .company { font-size:17px; font-weight:700; }
    .report-title { font-size:13px; font-weight:600; margin-top:3px; }
    .meta { font-size:10px; color:#666; margin-top:2px; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th { background:#333; color:#fff; padding:6px 8px; text-align:left; font-weight:600; }
    th:nth-child(6), th:nth-child(7), th:nth-child(8) { text-align:right; }
    td { padding:5px 8px; border-bottom:1px solid #e5e5e5; vertical-align:top; }
    tr:nth-child(even) td { background:#fafafa; }
    .footer { text-align:center; font-size:9px; color:#aaa; margin-top:24px; border-top:1px solid #ddd; padding-top:6px; }
    .print-btn { display:block; margin:16px auto 6px; padding:8px 30px; background:#222; color:#fff; border:none; cursor:pointer; font-size:13px; border-radius:4px; font-family:inherit; }
    @media print { .print-btn { display:none; } body { padding:0; } @page { margin:12mm; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl()}" style="height:64px;width:auto;display:block;margin:0 auto 8px;" alt="logo" onerror="this.style.display='none'">
    <div class="company">${meta.company}</div>
    <div class="report-title">${meta.reportTitle}</div>
    <div class="meta">${meta.dateLabel}</div>
    <div class="meta">তৈরি: ${meta.generatedOn}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>তারিখ</th>
        <th>ভাউচার নং</th>
        <th>ধরন</th>
        <th>হিসাব</th>
        <th>বিবরণ</th>
        <th>ডেবিট (৳)</th>
        <th>ক্রেডিট (৳)</th>
        <th>চলতি ব্যালেন্স</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      ${totalsHtml}
    </tbody>
  </table>
  <div class="footer">Confidential — Internal Use Only</div>
  <button class="print-btn" onclick="window.print()">🖨️ প্রিন্ট / PDF সেভ করুন</button>
  <script>document.fonts.ready.then(function(){ window.focus(); window.print(); });</script>
</body>
</html>`;
}

export function exportGLPDF(meta: ExportMeta, rows: GLRow[], _filename: string) {
  const html = buildGLPrintHTML(meta, rows);
  const win = window.open("", "_blank", "width=1000,height=900,scrollbars=yes,resizable=yes");
  if (!win) { alert("পপআপ ব্লক হয়েছে। ব্রাউজার সেটিংসে পপআপ চালু করুন।"); return; }
  win.document.write(html);
  win.document.close();
}

export function exportGLExcel(meta: ExportMeta, rows: GLRow[], filename: string) {
  const headers = ["তারিখ", "ভাউচার নং", "ধরন", "হিসাব", "বিবরণ", "ডেবিট (৳)", "ক্রেডিট (৳)", "চলতি ব্যালেন্স"];
  const dataRows = rows.map(r => [
    r.date, r.voucherNo, r.voucherType, r.account, r.narration,
    r.debit > 0 ? r.debit : "",
    r.credit > 0 ? r.credit : "",
    r.runningBalance != null ? r.runningBalance : "",
  ]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const sheetData: (string | number)[][] = [
    [meta.company], [meta.reportTitle], [meta.dateLabel], [`Generated: ${meta.generatedOn}`], [],
    headers, ...dataRows, [],
    ["", "", "", "", "মোট", totalDebit, totalCredit, ""],
    [balanced ? "✓ ডেবিট = ক্রেডিট" : `⚠ পার্থক্য: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "GL");
  XLSX.writeFile(wb, filename);
}

export function exportExcel(meta: ExportMeta, sections: ExportSection[], filename: string) {
  const rows: (string | number)[][] = [];

  rows.push([meta.company]);
  rows.push([meta.reportTitle]);
  rows.push([meta.dateLabel]);
  rows.push([`Generated: ${meta.generatedOn}`]);
  rows.push([]);

  for (const section of sections) {
    rows.push([section.title, ""]);
    for (const row of section.rows) {
      if (row.separator) {
        rows.push([]);
      } else {
        rows.push([row.indent ? `    ${row.label}` : row.label, row.value]);
      }
    }
    rows.push([]);
  }

  rows.push(["Confidential — Internal Use Only"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 40 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename);
}