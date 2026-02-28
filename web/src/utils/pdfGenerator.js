import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

// Helper to format dates
const formatDate = () => {
    const d = new Date();
    return d.toLocaleString();
};

// Flatten JSON into Key-Value rows for the tables
const flattenObjectToRows = (obj, prefix = '') => {
    let rows = [];
    for (const key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                rows = rows.concat(flattenObjectToRows(val, newKey));
            } else if (Array.isArray(val)) {
                const formattedArray = val.map(v => {
                    if (typeof v === 'object' && v !== null) {
                        return JSON.stringify(v, null, 2).replace(/[{}"]/g, '').trim();
                    }
                    return String(v);
                }).join('\n\n');
                rows.push([newKey, formattedArray || '[]']);
            } else {
                rows.push([newKey, String(val)]);
            }
        }
    }
    return rows;
};

export const generatePDFReport = (data, summaryText, lang = 'pt') => {
    const doc = new jsPDF();
    let currentY = 15;

    const t = {
        pt: { title: 'Relatório Consolidado de Inteligência de Ameaças', target: 'Alvo', type: 'Tipo', verdict: 'Veredito Global', error: 'Nenhum dado válido encontrado.', summary: 'Resumo da Análise' },
        en: { title: 'Consolidated Threat Intelligence Report', target: 'Target', type: 'Type', verdict: 'Global Verdict', error: 'No valid data found.', summary: 'Analysis Summary' },
        es: { title: 'Informe Consolidado de Inteligencia de Amenazas', target: 'Objetivo', type: 'Tipo', verdict: 'Veredicto Global', error: 'No se encontraron datos válidos.', summary: 'Resumen de Análisis' }
    };

    const loc = t[lang];

    // --- BRANDING HEADER ---
    // iT.eam dark blue styling
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 30, 'F');

    // Custom iT.eam branding accent line
    doc.setFillColor(56, 189, 248); // sky-400
    doc.rect(0, 30, 210, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('iT.eam SOC', 15, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(), 150, 20);

    // --- TITLE & TARGET INFO ---
    currentY = 45;
    doc.setTextColor(15, 23, 42); // slate-900 (Dark text for white paper)
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(loc.title, 15, currentY);

    currentY += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${loc.target}: ${data.target}`, 15, currentY);
    doc.text(`${loc.type}: ${data.type.toUpperCase()}`, 110, currentY);

    currentY += 8;
    const verdictColor = data.summary?.verdict === 'HIGH RISK' ? [220, 38, 38] : (data.summary?.verdict === 'SUSPICIOUS' ? [202, 138, 4] : [22, 163, 74]);
    doc.setTextColor(verdictColor[0], verdictColor[1], verdictColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`${loc.verdict}: ${data.summary?.verdict || 'UNKNOWN'}`, 15, currentY);
    doc.setTextColor(0, 0, 0);

    // --- HEURISTIC ANALYSIS (Text Block) ---
    if (summaryText) {
        currentY += 15;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(loc.summary, 15, currentY);

        currentY += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        // Remove markdown asterisks and replace backticks with single quotes
        const cleanSummary = summaryText.replace(/\*/g, '').replace(/`/g, "'");

        // Parse lines to apply bold formatting to markdown headers
        const lines = cleanSummary.split('\n');

        lines.forEach(line => {
            if (line.startsWith('### ')) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                currentY += 2; // Extra padding before header

                const headerText = line.replace('### ', '');
                const splitHeader = doc.splitTextToSize(headerText, 180);
                doc.text(splitHeader, 15, currentY);

                currentY += (splitHeader.length * 5) + 2; // Extra padding after header
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
            } else if (line.trim() !== '') {
                const splitText = doc.splitTextToSize(line, 180);
                doc.text(splitText, 15, currentY);
                currentY += (splitText.length * 5);
            } else {
                currentY += 3; // Emulate empty margin
            }
        });
        currentY += 5;
    } else {
        currentY += 10;
    }

    // --- FILTER OUT ERRORS & GENERATE TABLES ---
    const validServices = Object.entries(data.results || {}).filter(([name, resultData]) => {
        // Exclude strings (like empty messages) or objects containing error flags
        if (!resultData || typeof resultData !== 'object') return false;
        if (resultData.error || resultData._meta_error) return false;
        return true;
    });

    if (validServices.length === 0) {
        currentY += 10;
        doc.setFont('helvetica', 'italic');
        doc.text(loc.error, 15, currentY);
    } else {
        validServices.forEach(([serviceName, serviceData]) => {
            // Add a little padding before next table, check page bounds natively handled by autoTable mostly, 
            // but we supply startY.
            const rows = flattenObjectToRows(serviceData);

            if (rows.length === 0) return; // Skip if no meaningful data to print

            autoTable(doc, {
                startY: currentY + 10,
                head: [[serviceName.toUpperCase(), 'Details']],
                body: rows.slice(0, 40), // Limiting to top 40 rows to avoid insanely large unreadable dumps
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42], textColor: 255 }, // Dark Slate header
                alternateRowStyles: { fillColor: [241, 245, 249] }, // slate-100
                styles: { fontSize: 8, font: 'helvetica', cellPadding: 3, overflow: 'linebreak' },
                columnStyles: {
                    0: { cellWidth: 50, fontStyle: 'bold' },
                    1: { cellWidth: 130 }
                }
            });

            currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY : currentY;
        });
    }

    // Format filename safely (replacing dots with underscores to prevent browser extension confusion)
    const safeTarget = data.target.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `iTeam_ThreatReport_${safeTarget}.pdf`;

    // Save the PDF using FileSaver to enforce the filename in all browsers
    const pdfBlob = doc.output('blob');
    saveAs(pdfBlob, fileName);
};
