import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";

type ReportPayload = {
  target: string;
  type: string;
  summary?: {
    verdict?: string;
  };
  results?: Record<string, unknown>;
};

type ReportLanguage = "pt" | "en" | "es";

const LABELS: Record<
  ReportLanguage,
  {
    title: string;
    target: string;
    type: string;
    verdict: string;
    summary: string;
    empty: string;
  }
> = {
  pt: {
    title: "Relatório Consolidado de Inteligência",
    target: "Alvo",
    type: "Tipo",
    verdict: "Veredito Global",
    summary: "Resumo Analítico",
    empty: "Nenhum dado válido foi retornado para este alvo.",
  },
  en: {
    title: "Consolidated Threat Intelligence Report",
    target: "Target",
    type: "Type",
    verdict: "Global Verdict",
    summary: "Analyst Summary",
    empty: "No valid data was returned for this target.",
  },
  es: {
    title: "Informe Consolidado de Inteligencia",
    target: "Objetivo",
    type: "Tipo",
    verdict: "Veredicto Global",
    summary: "Resumen Analítico",
    empty: "No se devolvieron datos válidos para este objetivo.",
  },
};

function flattenObjectToRows(
  value: Record<string, unknown>,
  prefix = "",
): string[][] {
  let rows: string[][] = [];

  for (const [key, item] of Object.entries(value)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(item)) {
      rows.push([newKey, item.map((entry) => String(entry)).join(", ") || "[]"]);
      continue;
    }

    if (item && typeof item === "object") {
      rows = rows.concat(
        flattenObjectToRows(item as Record<string, unknown>, newKey),
      );
      continue;
    }

    rows.push([newKey, item == null ? "null" : String(item)]);
  }

  return rows;
}

export function generatePdfReport(
  payload: ReportPayload,
  reportText: string,
  language: ReportLanguage,
) {
  const labels = LABELS[language];
  const doc = new jsPDF();
  let currentY = 18;

  doc.setFillColor(13, 17, 23);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("VANTAGE", 14, 15);

  currentY = 36;
  doc.setTextColor(42, 52, 57);
  doc.setFontSize(18);
  doc.text(labels.title, 14, currentY);

  currentY += 10;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${labels.target}: ${payload.target}`, 14, currentY);
  doc.text(`${labels.type}: ${payload.type.toUpperCase()}`, 110, currentY);

  currentY += 8;
  doc.setFont("helvetica", "bold");
  doc.text(
    `${labels.verdict}: ${payload.summary?.verdict || "UNKNOWN"}`,
    14,
    currentY,
  );

  currentY += 14;
  doc.setFontSize(13);
  doc.text(labels.summary, 14, currentY);
  currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const cleanSummary = reportText.replace(/\*/g, "").replace(/`/g, "'");
  const summaryLines = doc.splitTextToSize(cleanSummary || labels.empty, 180);
  doc.text(summaryLines, 14, currentY);
  currentY += summaryLines.length * 5 + 6;

  const validServices = Object.entries(payload.results || {}).filter(
    ([, result]) =>
      result && typeof result === "object" && !(result as { error?: unknown }).error,
  );

  if (!validServices.length) {
    doc.text(labels.empty, 14, currentY + 6);
  } else {
    for (const [serviceName, serviceData] of validServices) {
      const rows = flattenObjectToRows(serviceData as Record<string, unknown>).slice(
        0,
        40,
      );
      if (!rows.length) continue;

      autoTable(doc, {
        startY: currentY + 8,
        head: [[serviceName.toUpperCase(), "Details"]],
        body: rows,
        theme: "striped",
        headStyles: { fillColor: [13, 17, 23], textColor: 255 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          overflow: "linebreak",
        },
        columnStyles: {
          0: { cellWidth: 52, fontStyle: "bold" },
          1: { cellWidth: 128 },
        },
      });

      currentY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || currentY;
    }
  }

  const safeTarget = payload.target.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Vantage_Report_${safeTarget}.pdf`;
  const blob = doc.output("blob");
  saveAs(blob, fileName);
}
