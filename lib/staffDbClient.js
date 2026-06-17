class StaffQueryBuilder {
  constructor(clinic, table) {
    this.clinic = clinic;
    this.table = table;
    this.action = 'select';
    this.selectCols = '*';
    this.filters = [];
    this.orderSpec = null;
    this.limitValue = null;
    this.rangeValue = null;
    this.singleValue = false;
    this.maybeSingleValue = false;
    this.payload = null;
    this.returnSelect = null;
  }

  select(cols) {
    if (this.action === 'insert' || this.action === 'update') {
      this.returnSelect = cols || '*';
      return this;
    }
    this.action = 'select';
    this.selectCols = cols || '*';
    return this;
  }

  insert(rows) {
    this.action = 'insert';
    this.payload = rows;
    return this;
  }

  update(row) {
    this.action = 'update';
    this.payload = row;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(col, val) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  neq(col, val) {
    this.filters.push({ op: 'neq', col, val });
    return this;
  }

  ilike(col, val) {
    this.filters.push({ op: 'ilike', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ op: 'in', col, val: vals });
    return this;
  }

  order(col, opts = {}) {
    this.orderSpec = { col, ascending: opts.ascending !== false };
    return this;
  }

  limit(n) {
    this.limitValue = n;
    return this;
  }

  range(from, to) {
    this.rangeValue = { from, to };
    return this;
  }

  single() {
    this.singleValue = true;
    return this;
  }

  maybeSingle() {
    this.maybeSingleValue = true;
    return this;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const response = await fetch('/api/staff/db', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic: this.clinic,
        table: this.table,
        action: this.action,
        select: this.action === 'select' ? this.selectCols : this.returnSelect,
        filters: this.filters,
        order: this.orderSpec,
        limit: this.limitValue,
        range: this.rangeValue,
        single: this.singleValue,
        maybeSingle: this.maybeSingleValue,
        data: this.payload,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { data: null, error: { message: body.error || 'Database request failed' } };
    }
    return {
      data: body.data ?? null,
      error: body.error ? { message: body.error } : null,
      count: body.count ?? null,
    };
  }
}

export function createStaffDb(clinic) {
  return {
    from(table) {
      return new StaffQueryBuilder(clinic, table);
    },
  };
}
