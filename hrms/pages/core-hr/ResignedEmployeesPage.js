'use strict';

const { BasePage } = require('../BasePage');

/**
 * /resigned-employees — read-only separation register (Core HR).
 * Grid: SlNo | Date | Name | Phone | Designation | Nationality.
 * No action buttons — resignations are triggered from the employee record.
 * Quirk: an empty tenant renders one row with EMPTY cells (no empty-state text).
 */
class ResignedEmployeesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'resigned-employees');

    // The only interactive control on the page (client-side name filter)
    this.nameFilterInput = page.locator('#filter-name');
  }

  /** Filter the register by name (client-side) and let the grid re-render. */
  async filterByName(name) {
    await this.nameFilterInput.fill(name);
    await this.waitReady();
  }

  /** Clear the name filter. */
  async clearFilter() {
    await this.nameFilterInput.fill('');
    await this.waitReady();
  }
}

module.exports = { ResignedEmployeesPage };
