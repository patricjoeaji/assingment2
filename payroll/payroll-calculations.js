function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getAustralianFinancialYearStart(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== dateValue) {
    return null;
  }

  const startYear = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${startYear}-07-01`;
}

function calculateAnnualResidentTax(annualIncome, taxYearStart = '2026-07-01') {
  const income = Math.max(0, Number(annualIncome) || 0);
  const taxYear = Number(String(taxYearStart).slice(0, 4));
  const firstTaxRate = taxYear >= 2026 ? 0.15 : taxYear >= 2024 ? 0.16 : 0.19;
  const brackets = taxYear >= 2024
    ? [
      { limit: 18200, rate: 0 },
      { limit: 45000, rate: firstTaxRate },
      { limit: 135000, rate: 0.30 },
      { limit: 190000, rate: 0.37 },
      { limit: Infinity, rate: 0.45 }
    ]
    : [
      { limit: 18200, rate: 0 },
      { limit: 45000, rate: firstTaxRate },
      { limit: 120000, rate: 0.325 },
      { limit: 180000, rate: 0.37 },
      { limit: Infinity, rate: 0.45 }
    ];

  let tax = 0;
  let lowerLimit = 0;
  for (const bracket of brackets) {
    const taxableInBracket = Math.max(0, Math.min(income, bracket.limit) - lowerLimit);
    tax += taxableInBracket * bracket.rate;
    lowerLimit = bracket.limit;
    if (income <= bracket.limit) break;
  }

  return roundMoney(tax);
}

function calculateWeeklyTax(weeklyGross, taxYearStart = '2026-07-01') {
  const annualisedIncome = Math.max(0, Number(weeklyGross) || 0) * 52;
  return roundMoney(calculateAnnualResidentTax(annualisedIncome, taxYearStart) / 52);
}

module.exports = {
  calculateAnnualResidentTax,
  calculateWeeklyTax,
  getAustralianFinancialYearStart,
  roundMoney
};
