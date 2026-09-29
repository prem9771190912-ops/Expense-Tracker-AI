const PDFDocument = require("pdfkit");

function formatINR(amount) {
  const num = Number(amount || 0);
  return "Rs. " + num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function generateReportPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        bufferPages: true
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const {
        userName = "User",
        userEmail = "",
        selectedPeriod = "Daily",
        dateRange = "",
        totalIncome = 0,
        totalExpense = 0,
        savings = 0,
        transactions = []
      } = data;

      // Palette
      const emerald = "#059669";
      const rose = "#dc2626";
      const sky = "#0284c7";
      const darkText = "#0f172a";
      const mutedText = "#64748b";
      const lightBg = "#f8fafc";
      const borderColor = "#e2e8f0";

      // 1. Header Banner
      doc.rect(36, 36, 523, 60).fill("#0f172a");

      doc.fillColor("#38bdf8").fontSize(10).font("Helvetica-Bold").text("SPENDWISE AI", 52, 48);
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text(`${selectedPeriod} Financial Report`, 52, 62);

      doc.fillColor("#94a3b8").fontSize(8).font("Helvetica").text(`Generated: ${new Date().toLocaleString("en-IN")}`, 380, 50, { align: "right", width: 160 });
      doc.fillColor("#cbd5e1").fontSize(8).font("Helvetica-Bold").text("CONFIDENTIAL", 380, 68, { align: "right", width: 160 });

      let currentY = 110;

      // 2. Info Card (User name, Selected Period, Date Range)
      doc.roundedRect(36, currentY, 523, 56, 6).fillAndStroke(lightBg, borderColor);

      // Left column
      doc.fillColor(mutedText).fontSize(8).font("Helvetica").text("USER NAME", 50, currentY + 12);
      doc.fillColor(darkText).fontSize(11).font("Helvetica-Bold").text(userName, 50, currentY + 24);
      doc.fillColor(mutedText).fontSize(8).font("Helvetica").text(userEmail, 50, currentY + 38);

      // Right column
      doc.fillColor(mutedText).fontSize(8).font("Helvetica").text("SELECTED PERIOD", 320, currentY + 12);
      doc.fillColor(darkText).fontSize(11).font("Helvetica-Bold").text(selectedPeriod, 320, currentY + 24);
      doc.fillColor(mutedText).fontSize(8).font("Helvetica").text("DATE RANGE:", 320, currentY + 38);
      doc.fillColor(darkText).fontSize(8).font("Helvetica-Bold").text(dateRange, 385, currentY + 38);

      currentY += 70;

      // 3. Summary Cards (Total Income, Total Expense, Savings)
      const cardWidth = 166;
      const cardHeight = 52;
      const cardGap = 12;

      // Income Box
      const card1X = 36;
      doc.roundedRect(card1X, currentY, cardWidth, cardHeight, 6).fillAndStroke("#ecfdf5", "#a7f3d0");
      doc.rect(card1X, currentY, 4, cardHeight).fill(emerald);
      doc.fillColor("#065f46").fontSize(8).font("Helvetica-Bold").text("TOTAL INCOME", card1X + 12, currentY + 10);
      doc.fillColor(emerald).fontSize(13).font("Helvetica-Bold").text(formatINR(totalIncome), card1X + 12, currentY + 26);

      // Expense Box
      const card2X = card1X + cardWidth + cardGap;
      doc.roundedRect(card2X, currentY, cardWidth, cardHeight, 6).fillAndStroke("#fff1f2", "#fecdd3");
      doc.rect(card2X, currentY, 4, cardHeight).fill(rose);
      doc.fillColor("#9f1239").fontSize(8).font("Helvetica-Bold").text("TOTAL EXPENSE", card2X + 12, currentY + 10);
      doc.fillColor(rose).fontSize(13).font("Helvetica-Bold").text(formatINR(totalExpense), card2X + 12, currentY + 26);

      // Savings Box
      const card3X = card2X + cardWidth + cardGap;
      doc.roundedRect(card3X, currentY, cardWidth, cardHeight, 6).fillAndStroke("#f0f9ff", "#bae6fd");
      doc.rect(card3X, currentY, 4, cardHeight).fill(sky);
      doc.fillColor("#075985").fontSize(8).font("Helvetica-Bold").text("SAVINGS", card3X + 12, currentY + 10);
      doc.fillColor(savings >= 0 ? sky : rose).fontSize(13).font("Helvetica-Bold").text(formatINR(savings), card3X + 12, currentY + 26);

      currentY += 66;

      // 4. Section Title: Transactions Table
      doc.fillColor(darkText).fontSize(12).font("Helvetica-Bold").text("Expense & Income Breakdown", 36, currentY);
      doc.fillColor(mutedText).fontSize(8).font("Helvetica").text(`${transactions.length} transaction(s)`, 400, currentY + 3, { align: "right", width: 159 });

      currentY += 16;

      // Table Coordinates
      const colX = {
        date: 44,
        desc: 120,
        cat: 300,
        type: 395,
        amount: 450
      };
      const colWidths = {
        date: 70,
        desc: 175,
        cat: 90,
        type: 50,
        amount: 100
      };

      // Table Header Row
      const headerHeight = 22;
      doc.rect(36, currentY, 523, headerHeight).fill("#1e293b");
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
      doc.text("Date", colX.date, currentY + 6);
      doc.text("Description", colX.desc, currentY + 6);
      doc.text("Category", colX.cat, currentY + 6);
      doc.text("Type", colX.type, currentY + 6);
      doc.text("Amount", colX.amount, currentY + 6, { align: "right", width: colWidths.amount });

      currentY += headerHeight;

      // Table Data Rows
      const rowHeight = 20;
      if (transactions.length === 0) {
        doc.rect(36, currentY, 523, 26).fillAndStroke(lightBg, borderColor);
        doc.fillColor(mutedText).fontSize(9).font("Helvetica").text("No transactions recorded for this period.", 36, currentY + 8, { align: "center", width: 523 });
        currentY += 26;
      } else {
        transactions.forEach((tx, idx) => {
          // Page break check
          if (currentY + rowHeight > 770) {
            doc.addPage();
            currentY = 40;
            doc.rect(36, currentY, 523, headerHeight).fill("#1e293b");
            doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
            doc.text("Date", colX.date, currentY + 6);
            doc.text("Description", colX.desc, currentY + 6);
            doc.text("Category", colX.cat, currentY + 6);
            doc.text("Type", colX.type, currentY + 6);
            doc.text("Amount", colX.amount, currentY + 6, { align: "right", width: colWidths.amount });
            currentY += headerHeight;
          }

          const isEven = idx % 2 === 0;
          doc.rect(36, currentY, 523, rowHeight).fillAndStroke(isEven ? "#ffffff" : "#f8fafc", borderColor);

          doc.fillColor(darkText).fontSize(8).font("Helvetica");
          doc.text(tx.date || "", colX.date, currentY + 6, { width: colWidths.date, ellipsis: true });
          doc.text(tx.description || "", colX.desc, currentY + 6, { width: colWidths.desc, ellipsis: true });
          doc.text(tx.category || "General", colX.cat, currentY + 6, { width: colWidths.cat, ellipsis: true });

          const isTxIncome = String(tx.type).toLowerCase() === "income";
          doc.fillColor(isTxIncome ? emerald : rose).font("Helvetica-Bold");
          doc.text(tx.type || (isTxIncome ? "Income" : "Expense"), colX.type, currentY + 6, { width: colWidths.type });

          doc.fillColor(isTxIncome ? emerald : darkText).font("Helvetica-Bold");
          doc.text(formatINR(tx.amount), colX.amount, currentY + 6, { align: "right", width: colWidths.amount });

          currentY += rowHeight;
        });
      }

      // Totals Footer Row
      if (currentY + 24 > 770) {
        doc.addPage();
        currentY = 40;
      }
      doc.rect(36, currentY, 523, 24).fillAndStroke("#f1f5f9", borderColor);
      doc.fillColor(darkText).fontSize(8).font("Helvetica-Bold");
      doc.text("Period Totals:", 50, currentY + 7);
      doc.fillColor(emerald).text(`Income: ${formatINR(totalIncome)}`, 260, currentY + 7);
      doc.fillColor(rose).text(`Expense: ${formatINR(totalExpense)}`, 400, currentY + 7, { align: "right", width: 150 });

      // Page Numbers & Footer note
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor("#94a3b8").fontSize(8).font("Helvetica");
        doc.text(
          `SpendWise AI • Confidentially generated for ${userName} (${userEmail}) • Page ${i + 1} of ${pages.count}`,
          36,
          802,
          { align: "center", width: 523 }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateReportPDF,
  formatINR
};
