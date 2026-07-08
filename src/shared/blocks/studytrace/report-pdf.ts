const A4_WIDTH_PX = 794; // ~210mm at 96dpi
const PAGE_PADDING_PX = 48;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert the lightweight Markdown report into simple inline-styled HTML.
 * Only inline styles are used (hex colors, system font) so that html2canvas
 * never has to parse Tailwind v4 `oklch` values, which it cannot handle.
 */
function reportToHtml(report: string) {
  const lines = report.split('\n');
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      closeList();
      html.push('<div style="height:8px"></div>');
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      html.push(
        `<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827">${escapeHtml(
          line.slice(2)
        )}</h1>`
      );
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      html.push(
        `<h2 style="margin:18px 0 8px;font-size:16px;font-weight:600;color:#1f2937;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${escapeHtml(
          line.slice(3)
        )}</h2>`
      );
      continue;
    }
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push(
          '<ul style="margin:4px 0 4px;padding-left:20px;color:#374151">'
        );
        inList = true;
      }
      html.push(
        `<li style="margin:2px 0;font-size:13px;line-height:1.7">${escapeHtml(
          line.slice(2)
        )}</li>`
      );
      continue;
    }

    closeList();
    html.push(
      `<p style="margin:4px 0;font-size:13px;line-height:1.7;color:#374151;white-space:pre-wrap;word-break:break-word">${escapeHtml(
        line
      )}</p>`
    );
  }

  closeList();
  return html.join('');
}

function buildRenderNode(report: string) {
  const container = document.createElement('div');
  container.setAttribute(
    'style',
    [
      'position:fixed',
      'left:-10000px',
      'top:0',
      `width:${A4_WIDTH_PX}px`,
      `padding:${PAGE_PADDING_PX}px`,
      'box-sizing:border-box',
      'background:#ffffff',
      'color:#111827',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
    ].join(';')
  );
  container.innerHTML = reportToHtml(report);
  return container;
}

function buildRenderFrame(report: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute(
    'style',
    [
      'position:fixed',
      'left:-10000px',
      'top:0',
      'width:1px',
      'height:1px',
      'border:0',
      'visibility:hidden',
    ].join(';')
  );
  document.body.appendChild(frame);

  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    frame.remove();
    throw new Error('Unable to prepare PDF render frame.');
  }

  frameDocument.open();
  frameDocument.write(
    '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#ffffff"></body></html>'
  );
  frameDocument.close();

  const node = buildRenderNode(report);
  node.style.position = 'relative';
  node.style.left = '0';
  node.style.top = '0';
  frameDocument.body.appendChild(node);

  return { frame, node };
}

export function openReportPdfPrintFallback(report: string, title: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      body {
        margin: 0;
        background: #ffffff;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px;
      }
      @media print {
        main { max-width: none; padding: 0; }
      }
    </style>
  </head>
  <body>
    <main>${reportToHtml(report)}</main>
    <script>
      window.addEventListener('load', () => {
        window.setTimeout(() => window.print(), 150);
      });
    </script>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();

  return true;
}

/**
 * Generate and download a PDF of the report entirely on the client.
 *
 * Renders an inline-styled offscreen node inside a clean iframe (no Tailwind
 * stylesheets, so no `oklch`), rasterizes it with html2canvas, and slices the
 * canvas across A4 pages.
 */
export async function exportReportPdf(report: string, fileName: string) {
  const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const JsPDF = (jsPdfModule as any).jsPDF || (jsPdfModule as any).default;

  const { frame, node } = buildRenderFrame(report);

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const pdf = new JsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(fileName);
  } finally {
    frame.remove();
  }
}
