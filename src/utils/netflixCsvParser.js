/**
 * Netflix CSV Parser
 * Parses Netflix viewing history CSV files
 */

/**
 * Parse a CSV row respecting quoted fields
 * @param {string} row - CSV row
 * @returns {array} Parsed fields
 */
function parseCSVRow(row) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quotes
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  fields.push(current.trim());
  
  return fields;
}

/**
 * Clean Netflix title to get base show/movie name
 * Examples:
 *   "Breaking Bad: Season 1: Pilot" → "Breaking Bad"
 *   "Stranger Things: Limited Series" → "Stranger Things"
 *   "The Crown: Season 3: Cri de Coeur" → "The Crown"
 * @param {string} title - Raw Netflix title
 * @returns {string} Cleaned title
 */
function cleanTitle(title) {
  if (!title) return '';
  
  // Remove everything after first colon (season/episode info)
  const cleaned = title.split(':')[0].trim();
  
  // Remove common suffixes
  return cleaned
    .replace(/: Limited Series$/i, '')
    .replace(/: Season \d+$/i, '')
    .replace(/: Part \d+$/i, '')
    .trim();
}

/**
 * Parse Netflix CSV text
 * @param {string} csvText - Raw CSV text
 * @returns {object} Parsed data with unique titles
 */
function parseNetflixCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Parse header
  const headerRow = parseCSVRow(lines[0]);
  const titleIndex = headerRow.findIndex(h => h.toLowerCase().includes('title'));
  const dateIndex = headerRow.findIndex(h => h.toLowerCase().includes('date'));
  
  if (titleIndex === -1) {
    throw new Error('CSV must contain a "Title" column');
  }
  
  // Parse data rows
  const items = [];
  const seenTitles = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    
    if (row.length <= titleIndex) continue;
    
    const rawTitle = row[titleIndex];
    const date = dateIndex !== -1 ? row[dateIndex] : null;
    
    if (!rawTitle) continue;
    
    const cleanedTitle = cleanTitle(rawTitle);
    
    // Skip duplicates (same show watched multiple times)
    if (seenTitles.has(cleanedTitle.toLowerCase())) {
      continue;
    }
    
    seenTitles.add(cleanedTitle.toLowerCase());
    
    // Try to extract year from title or use date
    let year = null;
    const yearMatch = cleanedTitle.match(/\((\d{4})\)/);
    if (yearMatch) {
      year = parseInt(yearMatch[1]);
    } else if (date) {
      const dateMatch = date.match(/\d{4}/);
      if (dateMatch) {
        year = parseInt(dateMatch[0]);
      }
    }
    
    items.push({
      title: cleanedTitle.replace(/\(\d{4}\)/, '').trim(),
      originalTitle: rawTitle,
      watchedAt: date,
      year: year
    });
  }
  
  return {
    total: items.length,
    items: items
  };
}

module.exports = {
  parseNetflixCSV,
  cleanTitle,
  parseCSVRow
};

