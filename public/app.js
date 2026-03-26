(() => {
  const BASE_CAP = 8_000_000;
  const PARTNERS = ['Felipe', 'Hernan'];
  const DISPLAY_NAMES = { Felipe: 'Felipe', Hernan: 'Hernán' };
  const TYPE_LABELS = {
    normal_income: 'Ingreso normal',
    special_income: 'Ingreso especial',
    shared_expense: 'Gasto compartido',
  };

  const state = {
    pin: sessionStorage.getItem('app-pin') || '',
    actor: localStorage.getItem('app-actor') || 'Felipe',
    movements: [],
    editingId: null,
    selectedMonth: null,
    unlocked: false,
    computed: null,
  };

  const els = {
    appShell: document.getElementById('app-shell'),
    loginOverlay: document.getElementById('loginOverlay'),
    loginForm: document.getElementById('loginForm'),
    pinInput: document.getElementById('pinInput'),
    loginError: document.getElementById('loginError'),
    actorSelect: document.getElementById('actorSelect'),
    lockBtn: document.getElementById('lockBtn'),
    newMovementBtn: document.getElementById('newMovementBtn'),
    exportBtn: document.getElementById('exportBtn'),
    monthSelect: document.getElementById('monthSelect'),
    selectedMonthLabel: document.getElementById('selectedMonthLabel'),
    globalBalances: document.getElementById('globalBalances'),
    partnerCards: document.getElementById('partnerCards'),
    movementsTableBody: document.getElementById('movementsTableBody'),
    pendingTableBody: document.getElementById('pendingTableBody'),
    movementCountPill: document.getElementById('movementCountPill'),
    movementOverlay: document.getElementById('movementOverlay'),
    movementModalTitle: document.getElementById('movementModalTitle'),
    movementForm: document.getElementById('movementForm'),
    movementId: document.getElementById('movementId'),
    movementDate: document.getElementById('movementDate'),
    movementType: document.getElementById('movementType'),
    movementPartner: document.getElementById('movementPartner'),
    movementAmount: document.getElementById('movementAmount'),
    movementConcept: document.getElementById('movementConcept'),
    specialIncomeFields: document.getElementById('specialIncomeFields'),
    specialPct: document.getElementById('specialPct'),
    paidToggleWrap: document.getElementById('paidToggleWrap'),
    paidToPartner: document.getElementById('paidToPartner'),
    movementNotes: document.getElementById('movementNotes'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    movementPreview: document.getElementById('movementPreview'),
    movementError: document.getElementById('movementError'),
    deleteMovementBtn: document.getElementById('deleteMovementBtn'),
    cancelMovementBtn: document.getElementById('cancelMovementBtn'),
    closeMovementModalBtn: document.getElementById('closeMovementModalBtn'),
  };

  function formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function formatDisplayDate(value) {
    const [y, m, d] = String(value || '').split('-').map(Number);
    if (!y || !m || !d) return '—';
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(dt);
  }

  function monthLabel(key) {
    const [year, month] = key.split('-').map(Number);
    const dt = new Date(year, month - 1, 1, 12, 0, 0);
    return new Intl.DateTimeFormat('es-CO', {
      month: 'long',
      year: 'numeric',
    }).format(dt);
  }

  function otherPartner(partner) {
    return partner === 'Felipe' ? 'Hernan' : 'Felipe';
  }

  function displayPartner(partner) {
    return DISPLAY_NAMES[partner] || partner;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function roundPeso(value) {
    return Math.round(Number(value || 0));
  }

  function compareMovements(a, b) {
    const byDate = String(a.movement_date).localeCompare(String(b.movement_date));
    if (byDate !== 0) return byDate;
    const byCreated = String(a.created_at || '').localeCompare(String(b.created_at || ''));
    if (byCreated !== 0) return byCreated;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function badge(label, kind = 'blue') {
    return `<span class="badge badge-${kind}">${escapeHtml(label)}</span>`;
  }

  function monthKey(dateStr) {
    return String(dateStr).slice(0, 7);
  }

  function makePartnerBucket() {
    return {
      threshold: BASE_CAP,
      carryIn: 0,
      carryOut: 0,
      progressEnd: 0,
      normalIncome: 0,
      specialIncome: 0,
      expensesPaid: 0,
      causedGross: 0,
      receivedFromSplit: 0,
      cededToOther: 0,
      outstandingToPay: 0,
      outstandingToReceive: 0,
      expenseRecoveryStart: 0,
      expenseRecoveryEnd: 0,
    };
  }

  function groupByMonth(movements) {
    const map = new Map();
    for (const movement of movements) {
      const key = monthKey(movement.movement_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(movement);
    }
    return map;
  }

  function normalizeMovement(raw) {
    return {
      ...raw,
      amount: Number(raw.amount || 0),
      special_partner_pct:
        raw.special_partner_pct === null || raw.special_partner_pct === undefined || raw.special_partner_pct === ''
          ? null
          : Number(raw.special_partner_pct),
      paid_to_partner: Boolean(Number(raw.paid_to_partner)),
    };
  }

  function computeState(movements) {
    const normalized = movements.map(normalizeMovement).sort(compareMovements);
    const grouped = groupByMonth(normalized);
    const orderedMonths = Array.from(grouped.keys()).sort();

    const carryDeficit = { Felipe: 0, Hernan: 0 };
    const expenseRecovery = { Felipe: 0, Hernan: 0 };
    const movementEffects = new Map();
    const pendingItems = [];
    const monthly = {};

    for (const key of orderedMonths) {
      const partnerStats = { Felipe: makePartnerBucket(), Hernan: makePartnerBucket() };
      const threshold = {
        Felipe: BASE_CAP + carryDeficit.Felipe,
        Hernan: BASE_CAP + carryDeficit.Hernan,
      };
      const progress = { Felipe: 0, Hernan: 0 };

      for (const partner of PARTNERS) {
        partnerStats[partner].threshold = threshold[partner];
        partnerStats[partner].carryIn = carryDeficit[partner];
        partnerStats[partner].expenseRecoveryStart = expenseRecovery[partner];
      }

      const typePriority = {
        shared_expense: 0,
        normal_income: 1,
        special_income: 2,
      };

      const monthMovements = [...grouped.get(key)].sort((a, b) => {
        const byPriority = typePriority[a.type] - typePriority[b.type];
        if (byPriority !== 0) return byPriority;
        return compareMovements(a, b);
      });

      for (const movement of monthMovements) {
        const owner = movement.partner;
        const other = otherPartner(owner);
        const effect = {
          id: movement.id,
          owner,
          other,
          type: movement.type,
          ownerGain: 0,
          otherGain: 0,
          recoveredExpense: 0,
          toThreshold: 0,
          splitBase: 0,
          paidToPartner: movement.paid_to_partner,
          pendingToOther: 0,
          expenseMode: null,
          previewText: '',
          specialPartnerPct: movement.special_partner_pct,
        };

        if (movement.type === 'normal_income') {
          const remainingToThreshold = Math.max(0, threshold[owner] - progress[owner]);
          const toThreshold = Math.min(movement.amount, remainingToThreshold);
          const excess = movement.amount - toThreshold;
          const recoveredExpense = Math.min(excess, expenseRecovery[owner]);
          expenseRecovery[owner] -= recoveredExpense;
          const splitBase = excess - recoveredExpense;
          const otherShare = Math.floor(splitBase / 2);
          const ownerShareFromSplit = splitBase - otherShare;
          const ownerGain = toThreshold + recoveredExpense + ownerShareFromSplit;

          progress[owner] += toThreshold;
          progress[other] += otherShare;

          partnerStats[owner].normalIncome += movement.amount;
          partnerStats[owner].causedGross += ownerGain;
          partnerStats[other].causedGross += otherShare;
          partnerStats[owner].cededToOther += otherShare;
          partnerStats[other].receivedFromSplit += otherShare;

          effect.ownerGain = ownerGain;
          effect.otherGain = otherShare;
          effect.recoveredExpense = recoveredExpense;
          effect.toThreshold = toThreshold;
          effect.splitBase = splitBase;
          effect.pendingToOther = movement.paid_to_partner ? 0 : otherShare;
          effect.previewText = [
            toThreshold > 0 ? `${formatCOP(toThreshold)} se queda completo en cabeza de ${displayPartner(owner)} para completar tope.` : null,
            recoveredExpense > 0 ? `${formatCOP(recoveredExpense)} se usa para reembolsar gasto compartido pagado por ${displayPartner(owner)}.` : null,
            splitBase > 0
              ? `${formatCOP(splitBase)} queda para repartir: ${formatCOP(ownerShareFromSplit)} para ${displayPartner(owner)} y ${formatCOP(otherShare)} para ${displayPartner(other)}.`
              : null,
          ]
            .filter(Boolean)
            .join(' ');

          if (otherShare > 0 && !movement.paid_to_partner) {
            partnerStats[owner].outstandingToPay += otherShare;
            partnerStats[other].outstandingToReceive += otherShare;
            pendingItems.push({
              month: key,
              movementId: movement.id,
              date: movement.movement_date,
              type: movement.type,
              from: owner,
              to: other,
              amount: otherShare,
              concept: movement.concept,
            });
          }
        }

        if (movement.type === 'special_income') {
          const pctForOther = movement.special_partner_pct ?? 50;
          const recoveredExpense = progress[owner] >= threshold[owner] ? Math.min(movement.amount, expenseRecovery[owner]) : 0;
          expenseRecovery[owner] -= recoveredExpense;
          const distributable = movement.amount - recoveredExpense;
          const otherShare = roundPeso((distributable * pctForOther) / 100);
          const safeOtherShare = Math.max(0, Math.min(distributable, otherShare));
          const ownerGain = recoveredExpense + (distributable - safeOtherShare);

          partnerStats[owner].specialIncome += movement.amount;
          partnerStats[owner].causedGross += ownerGain;
          partnerStats[other].causedGross += safeOtherShare;
          partnerStats[owner].cededToOther += safeOtherShare;
          partnerStats[other].receivedFromSplit += safeOtherShare;

          effect.ownerGain = ownerGain;
          effect.otherGain = safeOtherShare;
          effect.recoveredExpense = recoveredExpense;
          effect.pendingToOther = movement.paid_to_partner ? 0 : safeOtherShare;
          effect.previewText = [
            recoveredExpense > 0 ? `${formatCOP(recoveredExpense)} se usa primero para reembolsar gasto compartido pendiente de ${displayPartner(owner)}.` : null,
            `${formatCOP(distributable)} se reparte como ingreso especial: ${formatCOP(ownerGain - recoveredExpense)} para ${displayPartner(owner)} y ${formatCOP(safeOtherShare)} para ${displayPartner(other)}.`
          ].filter(Boolean).join(' ');

          if (safeOtherShare > 0 && !movement.paid_to_partner) {
            partnerStats[owner].outstandingToPay += safeOtherShare;
            partnerStats[other].outstandingToReceive += safeOtherShare;
            pendingItems.push({
              month: key,
              movementId: movement.id,
              date: movement.movement_date,
              type: movement.type,
              from: owner,
              to: other,
              amount: safeOtherShare,
              concept: movement.concept,
            });
          }
        }

        if (movement.type === 'shared_expense') {
          partnerStats[owner].expensesPaid += movement.amount;
          if (progress[owner] >= threshold[owner]) {
            expenseRecovery[owner] += movement.amount;
            effect.expenseMode = 'recovery_balance';
            effect.previewText = `${formatCOP(movement.amount)} queda como reembolso pendiente para ${displayPartner(owner)} antes de futuros repartos.`;
          } else {
            progress[owner] -= movement.amount;
            effect.expenseMode = 'reduces_progress';
            effect.previewText = `${formatCOP(movement.amount)} reduce el avance al tope de ${displayPartner(owner)} en este mes.`;
          }
        }

        movementEffects.set(movement.id, effect);
      }

      for (const partner of PARTNERS) {
        partnerStats[partner].progressEnd = progress[partner];
        partnerStats[partner].carryOut = Math.max(0, threshold[partner] - progress[partner]);
        partnerStats[partner].expenseRecoveryEnd = expenseRecovery[partner];
        carryDeficit[partner] = partnerStats[partner].carryOut;
      }

      monthly[key] = {
        key,
        partners: partnerStats,
      };
    }

    const globalBalances = {
      Felipe: { owes: 0, shouldReceive: 0 },
      Hernan: { owes: 0, shouldReceive: 0 },
    };

    for (const item of pendingItems) {
      globalBalances[item.from].owes += item.amount;
      globalBalances[item.to].shouldReceive += item.amount;
    }

    return {
      movements: normalized,
      monthly,
      orderedMonths,
      movementEffects,
      pendingItems,
      globalBalances,
    };
  }

  function getSelectedMonth() {
    const months = state.computed?.orderedMonths || [];
    if (!months.length) return null;
    if (state.selectedMonth && months.includes(state.selectedMonth)) return state.selectedMonth;
    return months[months.length - 1];
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('content-type', 'application/json');
    if (state.pin) headers.set('x-app-pin', state.pin);

    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Ocurrió un error inesperado.');
    }
    return data;
  }

  function fillPartnerSelect(selectEl) {
    selectEl.innerHTML = PARTNERS.map((partner) => `<option value="${partner}">${displayPartner(partner)}</option>`).join('');
  }

  function fillActorSelect() {
    fillPartnerSelect(els.actorSelect);
    els.actorSelect.value = state.actor;
  }

  function fillMonthSelect() {
    const months = state.computed?.orderedMonths || [];
    if (!months.length) {
      els.monthSelect.innerHTML = '<option value="">Sin datos</option>';
      els.selectedMonthLabel.textContent = 'Sin movimientos';
      return;
    }

    const selected = getSelectedMonth();
    state.selectedMonth = selected;
    els.monthSelect.innerHTML = months
      .slice()
      .reverse()
      .map((key) => `<option value="${key}">${escapeHtml(monthLabel(key))}</option>`)
      .join('');
    els.monthSelect.value = selected;
    els.selectedMonthLabel.textContent = monthLabel(selected);
  }

  function statusPillForMonth(stats) {
    if (stats.carryOut === 0) {
      return '<span class="progress-pill pill-success">Tope cubierto</span>';
    }
    return `<span class="progress-pill pill-warning">Arrastre: ${formatCOP(stats.carryOut)}</span>`;
  }

  function renderGlobalBalances() {
    const balances = state.computed?.globalBalances || {
      Felipe: { owes: 0, shouldReceive: 0 },
      Hernan: { owes: 0, shouldReceive: 0 },
    };

    els.globalBalances.innerHTML = PARTNERS.map((partner) => {
      const info = balances[partner];
      return `
        <div class="balance-item">
          <div>
            <strong>${escapeHtml(displayPartner(partner))}</strong>
            <div class="muted">Debe ${formatCOP(info.owes)} · Cobra ${formatCOP(info.shouldReceive)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPartnerCards() {
    const selected = getSelectedMonth();
    const monthData = selected ? state.computed.monthly[selected] : null;

    if (!monthData) {
      els.partnerCards.innerHTML = `
        <div class="card section-card"><p class="muted">Todavía no hay movimientos registrados.</p></div>
      `;
      return;
    }

    els.partnerCards.innerHTML = PARTNERS.map((partner) => {
      const stats = monthData.partners[partner];
      return `
        <article class="card partner-card">
          <div class="partner-topline">
            <div>
              <p class="eyebrow">${escapeHtml(displayPartner(partner))}</p>
              <h3>${formatCOP(stats.progressEnd)} / ${formatCOP(stats.threshold)}</h3>
              <p class="muted">Avance neto frente al tope de este mes.</p>
            </div>
            ${statusPillForMonth(stats)}
          </div>
          <div class="metric-grid">
            <div class="metric"><span class="label">Arrastre que entra</span><strong>${formatCOP(stats.carryIn)}</strong></div>
            <div class="metric"><span class="label">Arrastre que sale</span><strong>${formatCOP(stats.carryOut)}</strong></div>
            <div class="metric"><span class="label">Ingresos normales</span><strong>${formatCOP(stats.normalIncome)}</strong></div>
            <div class="metric"><span class="label">Ingresos especiales</span><strong>${formatCOP(stats.specialIncome)}</strong></div>
            <div class="metric"><span class="label">Causado económico del mes</span><strong>${formatCOP(stats.causedGross)}</strong><small>Lo que económicamente le corresponde, antes de pagos manuales entre socios.</small></div>
            <div class="metric"><span class="label">Gastos compartidos pagados</span><strong>${formatCOP(stats.expensesPaid)}</strong></div>
            <div class="metric"><span class="label">Recibido por reparto</span><strong>${formatCOP(stats.receivedFromSplit)}</strong></div>
            <div class="metric"><span class="label">Cedido al otro</span><strong>${formatCOP(stats.cededToOther)}</strong></div>
            <div class="metric"><span class="label">Pendiente por pagar</span><strong>${formatCOP(stats.outstandingToPay)}</strong></div>
            <div class="metric"><span class="label">Pendiente por cobrar</span><strong>${formatCOP(stats.outstandingToReceive)}</strong></div>
            <div class="metric"><span class="label">Reembolso de gastos al iniciar</span><strong>${formatCOP(stats.expenseRecoveryStart)}</strong></div>
            <div class="metric"><span class="label">Reembolso de gastos al cerrar</span><strong>${formatCOP(stats.expenseRecoveryEnd)}</strong></div>
          </div>
        </article>
      `;
    }).join('');
  }

  function movementTypeBadge(type) {
    if (type === 'normal_income') return badge(TYPE_LABELS[type], 'blue');
    if (type === 'special_income') return badge(TYPE_LABELS[type], 'green');
    return badge(TYPE_LABELS[type], 'amber');
  }

  function paymentBadge(movement, effect) {
    const generated = effect?.otherGain || 0;
    if (movement.type === 'shared_expense') return '<span class="muted">No aplica</span>';
    if (generated <= 0) return '<span class="muted">No generó saldo</span>';
    return movement.paid_to_partner ? badge('Pagado', 'green') : badge('Pendiente', 'red');
  }

  function effectSummary(movement, effect) {
    if (!effect) return '—';
    if (movement.type === 'shared_expense') {
      return effect.expenseMode === 'recovery_balance'
        ? `Reembolso futuro para ${displayPartner(movement.partner)}: ${formatCOP(movement.amount)}`
        : `Reduce avance al tope de ${displayPartner(movement.partner)} en ${formatCOP(movement.amount)}`;
    }

    const parts = [];
    parts.push(`${displayPartner(movement.partner)}: ${formatCOP(effect.ownerGain)}`);
    if (effect.otherGain > 0) parts.push(`${displayPartner(effect.other)}: ${formatCOP(effect.otherGain)}`);
    if (effect.recoveredExpense > 0) parts.push(`reembolso: ${formatCOP(effect.recoveredExpense)}`);
    return parts.join(' · ');
  }

  function renderMovementsTable() {
    const movements = state.computed?.movements || [];
    els.movementCountPill.textContent = `${movements.length} movimiento${movements.length === 1 ? '' : 's'}`;

    if (!movements.length) {
      els.movementsTableBody.innerHTML = '<tr><td colspan="8" class="muted">No hay movimientos registrados todavía.</td></tr>';
      return;
    }

    els.movementsTableBody.innerHTML = movements
      .slice()
      .reverse()
      .map((movement) => {
        const effect = state.computed.movementEffects.get(movement.id);
        return `
          <tr>
            <td>${escapeHtml(formatDisplayDate(movement.movement_date))}</td>
            <td>${movementTypeBadge(movement.type)}</td>
            <td>${escapeHtml(displayPartner(movement.partner))}<br /><span class="muted">ingresó ${escapeHtml(displayPartner(movement.entered_by))}</span></td>
            <td>
              <strong>${escapeHtml(movement.concept)}</strong>
              ${movement.notes ? `<div class="muted">${escapeHtml(movement.notes)}</div>` : ''}
            </td>
            <td class="mono">${formatCOP(movement.amount)}</td>
            <td>${escapeHtml(effectSummary(movement, effect))}</td>
            <td>${paymentBadge(movement, effect)}</td>
            <td>
              <div class="movement-actions">
                <button class="mini-btn" type="button" data-edit-id="${movement.id}">Editar</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderPendingTable() {
    const pending = state.computed?.pendingItems || [];
    if (!pending.length) {
      els.pendingTableBody.innerHTML = '<tr><td colspan="6" class="muted">No hay obligaciones pendientes entre socios.</td></tr>';
      return;
    }

    els.pendingTableBody.innerHTML = pending
      .slice()
      .reverse()
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(formatDisplayDate(item.date))}</td>
            <td>${movementTypeBadge(item.type)}</td>
            <td>${escapeHtml(displayPartner(item.from))}</td>
            <td>${escapeHtml(displayPartner(item.to))}</td>
            <td class="mono">${formatCOP(item.amount)}</td>
            <td>${escapeHtml(item.concept)}</td>
          </tr>
        `,
      )
      .join('');
  }

  function renderAll() {
    state.computed = computeState(state.movements);
    fillMonthSelect();
    renderGlobalBalances();
    renderPartnerCards();
    renderMovementsTable();
    renderPendingTable();
  }

  function showLoginError(message) {
    els.loginError.textContent = message;
    els.loginError.classList.remove('hidden');
  }

  function hideLoginError() {
    els.loginError.classList.add('hidden');
    els.loginError.textContent = '';
  }

  function showMovementError(message) {
    els.movementError.textContent = message;
    els.movementError.classList.remove('hidden');
  }

  function hideMovementError() {
    els.movementError.classList.add('hidden');
    els.movementError.textContent = '';
  }

  function closeMovementModal() {
    els.movementOverlay.classList.add('hidden');
    hideMovementError();
  }

  function openMovementModal(editId = null) {
    state.editingId = editId;
    fillPartnerSelect(els.movementPartner);
    els.movementPartner.value = state.actor;

    if (editId) {
      const current = state.movements.find((item) => item.id === editId);
      if (!current) return;
      els.movementModalTitle.textContent = 'Editar movimiento';
      els.movementId.value = current.id;
      els.movementDate.value = current.movement_date;
      els.movementType.value = current.type;
      els.movementPartner.value = current.partner;
      els.movementAmount.value = current.amount;
      els.movementConcept.value = current.concept;
      els.specialPct.value = current.special_partner_pct ?? 50;
      els.paidToPartner.checked = Boolean(current.paid_to_partner);
      els.movementNotes.value = current.notes || '';
      els.deleteMovementBtn.classList.remove('hidden');
    } else {
      els.movementModalTitle.textContent = 'Nuevo movimiento';
      els.movementForm.reset();
      els.movementId.value = '';
      els.movementDate.value = new Date().toISOString().slice(0, 10);
      els.movementType.value = 'normal_income';
      els.movementPartner.value = state.actor;
      els.specialPct.value = 50;
      els.paidToPartner.checked = false;
      els.deleteMovementBtn.classList.add('hidden');
    }

    syncFormVisibility();
    updateMovementPreview();
    hideMovementError();
    els.movementOverlay.classList.remove('hidden');
  }

  function getFormPayload() {
    const current = els.movementId.value
      ? state.movements.find((item) => item.id === els.movementId.value)
      : null;

    return {
      id: els.movementId.value || undefined,
      created_at: current?.created_at,
      movement_date: els.movementDate.value,
      partner: els.movementPartner.value,
      entered_by: state.actor,
      type: els.movementType.value,
      concept: els.movementConcept.value.trim(),
      amount: Number(els.movementAmount.value || 0),
      special_partner_pct: els.movementType.value === 'special_income' ? Number(els.specialPct.value || 50) : null,
      paid_to_partner: els.paidToPartner.checked,
      notes: els.movementNotes.value.trim(),
    };
  }

  function candidateMovementsForPreview(candidate) {
    const others = state.movements.filter((item) => item.id !== candidate.id);
    const fakeId = candidate.id || '__preview__';
    return [...others, { ...candidate, id: fakeId, created_at: candidate.created_at || new Date().toISOString() }];
  }

  function syncFormVisibility() {
    const type = els.movementType.value;
    els.specialIncomeFields.classList.toggle('hidden', type !== 'special_income');
  }

  function updateMovementPreview() {
    syncFormVisibility();
    const payload = getFormPayload();

    if (!payload.movement_date || !payload.partner || !payload.type || !payload.amount || payload.amount <= 0 || !payload.concept) {
      els.movementPreview.innerHTML = 'Completa fecha, socio, valor y concepto para ver el efecto calculado.';
      els.paidToggleWrap.classList.add('hidden');
      return;
    }

    const previewData = computeState(candidateMovementsForPreview(payload));
    const effect = previewData.movementEffects.get(payload.id || '__preview__');
    const generatedShare = effect?.otherGain || 0;

    if (generatedShare > 0) {
      els.paidToggleWrap.classList.remove('hidden');
    } else {
      els.paidToggleWrap.classList.add('hidden');
      els.paidToPartner.checked = false;
    }

    if (!effect) {
      els.movementPreview.innerHTML = 'No fue posible calcular una vista previa.';
      return;
    }

    const detailLines = [
      `<strong>Efecto calculado</strong>`,
      `<div>${escapeHtml(effect.previewText || 'Sin efecto especial.')}</div>`,
    ];

    if (generatedShare > 0) {
      detailLines.push(
        `<div>Si no marcas la casilla de pago, quedará saldo pendiente de <strong>${formatCOP(generatedShare)}</strong> a favor de ${escapeHtml(displayPartner(effect.other))}.</div>`,
      );
    }

    els.movementPreview.innerHTML = detailLines.join('');
  }

  async function loadMovements() {
    const data = await api('/api/movements', { method: 'GET' });
    state.movements = (data.items || []).map(normalizeMovement);
    renderAll();
  }

  async function handleLogin(pin) {
    hideLoginError();
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'PIN inválido.');
    }

    state.pin = pin;
    sessionStorage.setItem('app-pin', pin);
    state.unlocked = true;
    els.loginOverlay.classList.add('hidden');
    els.appShell.classList.remove('hidden');
    await loadMovements();
  }

  function lockApp() {
    state.pin = '';
    state.unlocked = false;
    sessionStorage.removeItem('app-pin');
    els.pinInput.value = '';
    els.loginOverlay.classList.remove('hidden');
    els.appShell.classList.add('hidden');
    closeMovementModal();
  }

  function attachEvents() {
    els.loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const pin = els.pinInput.value.trim();
      if (!pin) {
        showLoginError('Debes ingresar el PIN.');
        return;
      }
      try {
        await handleLogin(pin);
      } catch (error) {
        showLoginError(error.message);
      }
    });

    els.actorSelect.addEventListener('change', () => {
      state.actor = els.actorSelect.value;
      localStorage.setItem('app-actor', state.actor);
    });

    els.monthSelect.addEventListener('change', () => {
      state.selectedMonth = els.monthSelect.value;
      renderPartnerCards();
    });

    els.lockBtn.addEventListener('click', lockApp);
    els.themeToggleBtn.addEventListener('click', toggleTheme);
    els.newMovementBtn.addEventListener('click', () => openMovementModal());
    els.cancelMovementBtn.addEventListener('click', closeMovementModal);
    els.closeMovementModalBtn.addEventListener('click', closeMovementModal);

    els.movementType.addEventListener('change', updateMovementPreview);
    els.movementPartner.addEventListener('change', updateMovementPreview);
    els.movementDate.addEventListener('change', updateMovementPreview);
    els.movementAmount.addEventListener('input', updateMovementPreview);
    els.movementConcept.addEventListener('input', updateMovementPreview);
    els.specialPct.addEventListener('input', updateMovementPreview);
    els.movementNotes.addEventListener('input', updateMovementPreview);
    els.paidToPartner.addEventListener('change', updateMovementPreview);

    els.movementForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideMovementError();
      const payload = getFormPayload();

      if (!payload.movement_date || !payload.partner || !payload.type || !payload.concept || !payload.amount) {
        showMovementError('Completa los campos obligatorios.');
        return;
      }

      if (payload.amount <= 0) {
        showMovementError('El valor debe ser positivo.');
        return;
      }

      try {
        if (payload.id) {
          const { id, ...body } = payload;
          await api(`/api/movements/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await api('/api/movements', { method: 'POST', body: JSON.stringify(payload) });
        }
        await loadMovements();
        closeMovementModal();
      } catch (error) {
        showMovementError(error.message);
      }
    });

    els.deleteMovementBtn.addEventListener('click', async () => {
      const id = els.movementId.value;
      if (!id) return;
      const ok = window.confirm('¿Seguro que quieres eliminar este movimiento?');
      if (!ok) return;
      try {
        await api(`/api/movements/${id}`, { method: 'DELETE' });
        await loadMovements();
        closeMovementModal();
      } catch (error) {
        showMovementError(error.message);
      }
    });

    els.movementsTableBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-id]');
      if (!button) return;
      openMovementModal(button.getAttribute('data-edit-id'));
    });

    els.exportBtn.addEventListener('click', exportWorkbook);
  }

  function exportWorkbook() {
    if (!window.XLSX) {
      alert('La librería de Excel todavía no cargó. Intenta de nuevo en unos segundos.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const rawMovements = (state.computed?.movements || []).map((movement) => {
      const effect = state.computed.movementEffects.get(movement.id);
      return {
        Fecha: movement.movement_date,
        Tipo: TYPE_LABELS[movement.type],
        Socio: displayPartner(movement.partner),
        'Ingresó info': displayPartner(movement.entered_by),
        Concepto: movement.concept,
        Valor: movement.amount,
        'Pct otro socio': movement.special_partner_pct ?? '',
        'Pagado al otro': movement.paid_to_partner ? 'Sí' : 'No',
        'Efecto calculado': effectSummary(movement, effect),
        Observaciones: movement.notes || '',
      };
    });

    const monthlyRows = [];
    for (const key of state.computed?.orderedMonths || []) {
      for (const partner of PARTNERS) {
        const stats = state.computed.monthly[key].partners[partner];
        monthlyRows.push({
          Mes: monthLabel(key),
          Socio: displayPartner(partner),
          'Tope del mes': stats.threshold,
          'Arrastre entrada': stats.carryIn,
          'Avance final': stats.progressEnd,
          'Arrastre salida': stats.carryOut,
          'Ingresos normales': stats.normalIncome,
          'Ingresos especiales': stats.specialIncome,
          'Causado económico': stats.causedGross,
          'Gastos pagados': stats.expensesPaid,
          'Recibido por reparto': stats.receivedFromSplit,
          'Cedido al otro': stats.cededToOther,
          'Pendiente por pagar': stats.outstandingToPay,
          'Pendiente por cobrar': stats.outstandingToReceive,
          'Reembolso gastos al inicio': stats.expenseRecoveryStart,
          'Reembolso gastos al cierre': stats.expenseRecoveryEnd,
        });
      }
    }

    const pendingRows = (state.computed?.pendingItems || []).map((item) => ({
      Fecha: item.date,
      Mes: monthLabel(item.month),
      Origen: TYPE_LABELS[item.type],
      'Debe pagar': displayPartner(item.from),
      'Debe recibir': displayPartner(item.to),
      Valor: item.amount,
      Concepto: item.concept,
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawMovements), 'Movimientos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Resumen mensual');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendingRows), 'Pendientes');

    const fileName = `reparto-hernan-felipe-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('app-theme', next);
    els.themeToggleBtn.textContent = next === 'dark' ? 'Modo claro' : 'Modo oscuro';
  }

  function initTheme() {
    const saved = localStorage.getItem('app-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = saved || preferred;
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      els.themeToggleBtn.textContent = 'Modo claro';
    }
  }

  async function init() {
    fillActorSelect();
    fillPartnerSelect(els.movementPartner);
    els.movementDate.value = new Date().toISOString().slice(0, 10);
    els.movementPartner.value = state.actor;
    attachEvents();
    initTheme();

    if (state.pin) {
      try {
        await handleLogin(state.pin);
      } catch {
        lockApp();
      }
    }
  }

  init();
})();
