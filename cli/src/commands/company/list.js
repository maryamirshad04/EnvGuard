const api = require('../../api');
const Table = require('cli-table3');

module.exports = async function listCompanies() {
  try {
    const res = await api.get('/companies');
    let companies = res.data;
    if (!Array.isArray(companies)) {
      companies = companies.companies || companies.data || [];
    }

    if (companies.length === 0) {
      console.log('You are not a member of any company.');
      return;
    }

    const table = new Table({ head: ['Name', 'Role'] });
    companies.forEach(c => {
      table.push([c.name, c.role]);
    });
    console.log(table.toString());
  } catch (err) {
    console.error('Failed to list companies:', err.response?.data?.error || err.message);
  }
};