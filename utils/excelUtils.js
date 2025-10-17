// utils/excelUtils.js
const ExcelJS = require('exceljs');

class ExcelUtils {
  
  // Apply standard styling to worksheet headers
  static styleHeaders(worksheet, headerRow = 1) {
    const row = worksheet.getRow(headerRow);
    
    row.font = {
      bold: true,
      color: { argb: 'FFFFFF' },
      size: 12
    };
    
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '6B46C1' }
    };
    
    row.alignment = {
      vertical: 'middle',
      horizontal: 'center'
    };
    
    row.border = {
      top: { style: 'thin', color: { argb: '000000' } },
      left: { style: 'thin', color: { argb: '000000' } },
      bottom: { style: 'thin', color: { argb: '000000' } },
      right: { style: 'thin', color: { argb: '000000' } }
    };
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(Math.max(maxLength + 2, 12), 50);
    });
  }
  
  /**
   * Apply zebra striping to data rows
   */
  static applyZebraStripes(worksheet, startRow = 2, endRow = null) {
    if (!endRow) {
      endRow = worksheet.rowCount;
    }
    
    for (let i = startRow; i <= endRow; i++) {
      if (i % 2 === 0) {
        worksheet.getRow(i).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F8F9FA' }
        };
      }
    }
  }
  
  /**
   * Add a title section to worksheet
   */
  static addTitle(worksheet, title, subtitle = null) {
    // Insert rows at the beginning
    worksheet.spliceRows(1, 0, [], []);
    if (subtitle) {
      worksheet.spliceRows(1, 0, []);
    }
    
    // Add title
    worksheet.mergeCells(1, 1, 1, worksheet.columnCount);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = {
      bold: true,
      size: 16,
      color: { argb: '6B46C1' }
    };
    titleCell.alignment = {
      vertical: 'middle',
      horizontal: 'center'
    };
    
    // Add subtitle if provided
    if (subtitle) {
      worksheet.mergeCells(2, 1, 2, worksheet.columnCount);
      const subtitleCell = worksheet.getCell(2, 1);
      subtitleCell.value = subtitle;
      subtitleCell.font = {
        size: 12,
        color: { argb: '718096' }
      };
      subtitleCell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
    }
    
    // Add empty row
    worksheet.addRow([]);
  }
  
  /**
   * Format currency values in a column
   */
  static formatCurrencyColumn(worksheet, columnIndex, startRow = 2) {
    for (let i = startRow; i <= worksheet.rowCount; i++) {
      const cell = worksheet.getCell(i, columnIndex);
      if (cell.value && typeof cell.value === 'number') {
        cell.numFmt = '"₱"#,##0.00';
      }
    }
  }
  
  /**
   * Format percentage values in a column
   */
  static formatPercentageColumn(worksheet, columnIndex, startRow = 2) {
    for (let i = startRow; i <= worksheet.rowCount; i++) {
      const cell = worksheet.getCell(i, columnIndex);
      if (cell.value && typeof cell.value === 'number') {
        cell.numFmt = '0.0"%"';
      }
    }
  }
  
  /**
   * Add data validation to a column
   */
  static addDataValidation(worksheet, columnIndex, startRow, endRow, options) {
    for (let i = startRow; i <= endRow; i++) {
      const cell = worksheet.getCell(i, columnIndex);
      cell.dataValidation = options;
    }
  }
  
  /**
   * Create a summary section
   */
  static addSummarySection(worksheet, title, data, startRow = null) {
    if (!startRow) {
      startRow = worksheet.rowCount + 2;
    }
    
    // Add section title
    worksheet.getCell(startRow, 1).value = title;
    worksheet.getCell(startRow, 1).font = {
      bold: true,
      size: 14,
      color: { argb: '2D3748' }
    };
    
    // Add summary data
    let currentRow = startRow + 1;
    Object.entries(data).forEach(([key, value]) => {
      worksheet.getCell(currentRow, 1).value = key;
      worksheet.getCell(currentRow, 1).font = { color: { argb: '4A5568' } };
      
      worksheet.getCell(currentRow, 2).value = value;
      worksheet.getCell(currentRow, 2).font = { bold: true, color: { argb: '2D3748' } };
      
      if (typeof value === 'number' && key.toLowerCase().includes('revenue')) {
        worksheet.getCell(currentRow, 2).numFmt = '"₱"#,##0.00';
      }
      
      currentRow++;
    });
    
    return currentRow;
  }
  
  /**
   * Add a chart (placeholder - ExcelJS has limited chart support)
   */
  static addChartPlaceholder(worksheet, title, data, startRow = null) {
    if (!startRow) {
      startRow = worksheet.rowCount + 2;
    }
    
    // Add chart title
    worksheet.getCell(startRow, 1).value = `${title} (Chart Data)`;
    worksheet.getCell(startRow, 1).font = {
      bold: true,
      size: 12,
      color: { argb: '6B46C1' }
    };
    
    // Add chart data
    let currentRow = startRow + 1;
    worksheet.getCell(currentRow, 1).value = 'Label';
    worksheet.getCell(currentRow, 2).value = 'Value';
    
    // Style headers
    worksheet.getRow(currentRow).font = { bold: true };
    worksheet.getRow(currentRow).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E2E8F0' }
    };
    
    currentRow++;
    
    data.forEach(item => {
      worksheet.getCell(currentRow, 1).value = item.label;
      worksheet.getCell(currentRow, 2).value = item.value;
      
      if (typeof item.value === 'number') {
        worksheet.getCell(currentRow, 2).numFmt = '"₱"#,##0.00';
      }
      
      currentRow++;
    });
    
    return currentRow;
  }
  
  /**
   * Apply borders to a range
   */
  static applyBorders(worksheet, startRow, endRow, startCol = 1, endCol = null) {
    if (!endCol) {
      endCol = worksheet.columnCount;
    }
    
    const borderStyle = { style: 'thin', color: { argb: '000000' } };
    
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = {
          top: borderStyle,
          left: borderStyle,
          bottom: borderStyle,
          right: borderStyle
        };
      }
    }
  }
  
  /**
   * Create a professional looking workbook with metadata
   */
  static createWorkbook(title, creator = 'Pet Grooming System') {
    const workbook = new ExcelJS.Workbook();
    
    workbook.creator = creator;
    workbook.lastModifiedBy = creator;
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.lastPrinted = new Date();
    
    // Set workbook properties
    workbook.properties.date1904 = false;
    
    // Add custom properties
    workbook.properties.title = title;
    workbook.properties.subject = 'Business Report';
    workbook.properties.keywords = 'report, analytics, grooming, pets';
    workbook.properties.category = 'Business Analytics';
    workbook.properties.description = `Generated report for ${title}`;
    
    return workbook;
  }
  
  /**
   * Format date column
   */
  static formatDateColumn(worksheet, columnIndex, startRow = 2, format = 'mm/dd/yyyy') {
    for (let i = startRow; i <= worksheet.rowCount; i++) {
      const cell = worksheet.getCell(i, columnIndex);
      if (cell.value) {
        cell.numFmt = format;
      }
    }
  }
  
  /**
   * Add conditional formatting for growth indicators
   */
  static addGrowthConditionalFormatting(worksheet, columnIndex, startRow = 2) {
    const endRow = worksheet.rowCount;
    
    // Positive growth (green)
    worksheet.addConditionalFormatting({
      ref: `${worksheet.getColumn(columnIndex).letter}${startRow}:${worksheet.getColumn(columnIndex).letter}${endRow}`,
      rules: [{
        type: 'cellIs',
        operator: 'greaterThan',
        formulae: [0],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'D1FAE5' }
          },
          font: {
            color: { argb: '059669' }
          }
        }
      }]
    });
    
    // Negative growth (red)
    worksheet.addConditionalFormatting({
      ref: `${worksheet.getColumn(columnIndex).letter}${startRow}:${worksheet.getColumn(columnIndex).letter}${endRow}`,
      rules: [{
        type: 'cellIs',
        operator: 'lessThan',
        formulae: [0],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FEE2E2' }
          },
          font: {
            color: { argb: 'DC2626' }
          }
        }
      }]
    });
  }
}

module.exports = ExcelUtils;