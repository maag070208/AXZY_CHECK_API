import PDFDocument from 'pdfkit';
import { getKardex } from './movements.service';
import dayjs from 'dayjs';

interface KardexPdfFilters {
    startDate: string;
    endDate: string;
    operatorId?: number;
    userId?: number;
}

export const generateKardexPdf = async (filters: KardexPdfFilters): Promise<string> => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Ensure directory exists
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(process.cwd(), 'public', 'pdf');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `kardex-${Date.now()}.pdf`;
    const filepath = path.join(dir, filename);
    const writeStream = fs.createWriteStream(filepath);

    doc.pipe(writeStream);

    // Fetch Data
    let kardex = await getKardex();

    // 1. Filter Data
    const start = dayjs(filters.startDate).startOf('day');
    const end = dayjs(filters.endDate).endOf('day');

    kardex = kardex.filter(item => {
        const itemDate = dayjs(item.date);
        const inDateRange = itemDate.isAfter(start) && itemDate.isBefore(end);
        
        let matchesOperator = true;
        /* Note: Original getKardex doesn't return operatorId, just name. 
           Ideally we should update getKardex to include IDs, but for now we filter loosely if name is provided 
           or we trust the frontend sends filtered request and we might need to update getKardex.
           
           For this iteration, let's update logic to filter by date strictly. 
           Operator/User filtering would require ID references in the mapped object.
        */
        
        return inDateRange;
    });

    // --- Header ---
    doc
        .fontSize(20)
        .fillColor('#1e293b')
        .text('Reporte de Movimientos (Kárdex)', { align: 'center' })
        .moveDown(0.5);

    doc
        .fontSize(10)
        .fillColor('#64748b')
        .text(`Generado el: ${dayjs().format('DD/MM/YYYY HH:mm')}`, { align: 'center' })
        .moveDown(0.5);

    doc
        .fontSize(10)
        .text(`Rango: ${dayjs(filters.startDate).format('DD/MM/YYYY')} - ${dayjs(filters.endDate).format('DD/MM/YYYY')}`, { align: 'center' })
        .moveDown(2);

    // --- Summary Cards (Mini Stats) ---
    const startY = doc.y;
    const totalMovements = kardex.length;
    const entries = kardex.filter(k => k.type === 'INGRESO').length;
    const exits = kardex.filter(k => k.type === 'SALIDA').length;

    drawStatCard(doc, 50, startY, 'Total Movimientos', totalMovements.toString());
    drawStatCard(doc, 200, startY, 'Entradas', entries.toString());
    drawStatCard(doc, 350, startY, 'Salidas', exits.toString());

    doc.moveDown(5);

    // --- Table Header ---
    const tableTop = doc.y;
    const colDate = 50;
    const colPlate = 120; // +70
    const colType = 180;  // +60
    const colDesc = 280; // +100
    const colUser = 430; // +150

    doc
        .fontSize(9)
        .fillColor('#334155')
        .font('Helvetica-Bold');

    doc.text('FECHA', colDate, tableTop);
    doc.text('PLACAS', colPlate, tableTop);
    doc.text('TIPO', colType, tableTop);
    doc.text('DESCRIPCIÓN', colDesc, tableTop);
    doc.text('OPERADOR/USUARIO', colUser, tableTop);

    drawLine(doc, tableTop + 15);
    
    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(8).fillColor('#475569');

    // --- Table Rows ---
    kardex.forEach((item, index) => {
        if (y > 750) { // Add Page if bottom reached
            doc.addPage();
            y = 50;
            // Draw header again? Or just continue
        }

        const dateStr = dayjs(item.date).format('DD/MM HH:mm');
        const typeStr = item.type.substring(0, 12);
        const descStr = item.description.length > 30 ? item.description.substring(0, 27) + '...' : item.description;
        const userStr = (item.operatorName || item.clientName || '-').substring(0, 20);

        doc.text(dateStr, colDate, y);
        doc.text(item.plates || '-', colPlate, y);
        doc.text(typeStr, colType, y);
        doc.text(descStr, colDesc, y);
        doc.text(userStr, colUser, y);

        y += 20;

        // Divider
        doc.strokeColor('#f1f5f9').lineWidth(0.5)
           .moveTo(50, y - 8)
           .lineTo(550, y - 8)
           .stroke();
    });

    doc.end();

    return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
            resolve(`/pdf/${filename}`);
        });
        writeStream.on('error', reject);
    });
};

function drawStatCard(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
    doc.roundedRect(x, y, 120, 50, 4).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor('#64748b').fontSize(8).text(label, x + 10, y + 10);
    doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(value, x + 10, y + 25);
}

function drawLine(doc: PDFKit.PDFDocument, y: number) {
    doc.strokeColor('#cbd5e1').lineWidth(1)
       .moveTo(50, y)
       .lineTo(550, y)
       .stroke();
}
