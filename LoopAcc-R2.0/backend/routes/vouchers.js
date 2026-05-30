
import express from "express";
const router = express.Router();
import { getVoucherById, getVouchersByCompany, getOutstandingReceivables, getOutstandingPayables, getVoucherHistory, getSalesRegister, getPurchaseRegister, createVoucherWithDetails, updateVoucherWithDetails } from "../services/voucherService.js";

// GET /api/vouchers/print/inventory/:id
router.get("/print/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = (await import("../db.js")).getDb();
    const voucher = await getVoucherById(id);
    if (!voucher) return res.status(404).send("Voucher not found");
    const company = await db.collection("companies").findOne({ id: voucher.company_id });
    const ledgers = await db.collection("ledgers").find({ company_id: voucher.company_id }).toArray();
    const items = await db.collection("item_master").find({ company_id: voucher.company_id }).toArray();

    // Helper functions (copied from frontend logic)
    function formatAmount(val, withSymbol = false) {
      const abs = Math.abs(Number(val || 0));
      const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const prefixed = `${withSymbol ? '₹ ' : ''}${formatted}`;
      return Number(val) < 0 ? `-${prefixed}` : prefixed;
    }
    function numberToWords(value) {
      const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      function integerToWords(num) {
        if (num < 20) return ones[num];
        if (num < 100) return `${tens[Math.floor(num/10)]}${num%10 ? ` ${ones[num%10]}` : ''}`;
        if (num < 1000) return `${ones[Math.floor(num/100)]} Hundred${num%100 ? ` ${integerToWords(num%100)}` : ''}`;
        if (num < 100000) return `${integerToWords(Math.floor(num/1000))} Thousand${num%1000 ? ` ${integerToWords(num%1000)}` : ''}`;
        if (num < 10000000) return `${integerToWords(Math.floor(num/100000))} Lakh${num%100000 ? ` ${integerToWords(num%100000)}` : ''}`;
        return `${integerToWords(Math.floor(num/10000000))} Crore${num%10000000 ? ` ${integerToWords(num%10000000)}` : ''}`;
      }
      const abs = Math.abs(Number(value) || 0);
      const rupees = Math.floor(abs);
      const paise = Math.round((abs - rupees) * 100);
      return `${value < 0 ? 'Minus ' : ''}${rupees === 0 ? 'Zero' : integerToWords(rupees)} Rupees${paise > 0 ? ` and ${integerToWords(paise)} Paise` : ''} Only`;
    }

    // Prepare inventory items and ledgers
    const inventoryItems = voucher.inventory || [];
    // Show all ledger entries (including party/inventory ledgers)
    const additionalLedgers = (voucher.ledger_entries || []).filter(e => e.ledger_id);
    const printableAdditionalLedgers = additionalLedgers.map(entry => ({ entry, ledger: ledgers.find(l => l.id === entry.ledger_id) }));

    const itemRows = inventoryItems.filter(i => i.item_id).map((item, idx) => {
      const itemMaster = items.find(i2 => i2.id === item.item_id);
      const unit = itemMaster?.uom_master?.symbol || itemMaster?.uom_master?.name || '';
      const hsnCode = itemMaster?.hsn_code || '';
      let batchInfo = '';
      if (itemMaster?.enable_batches === true) {
        const allocs = Array.isArray(item.batch_allocations) && item.batch_allocations.length > 0
          ? item.batch_allocations
          : (item.batch_id ? [{ batch_id: item.batch_id, batch_number: item.batch_id, qty: item.batch_qty ?? item.quantity, rate: item.rate }] : []);
        if (allocs.length > 0) {
          const lines = allocs.map(a => {
            const bName = a.batch_number || a.batch_id || '';
            const bQty  = Number(a.qty || 0);
            const bRate = Number(a.rate || 0);
            return `Batch: ${bName} | Qty: ${bQty.toFixed(2)} | Rate: ${formatAmount(bRate)}`;
          });
          batchInfo = `<div style="font-size:10px;color:#555;margin-top:2px">${lines.join('<br/>')}</div>`;
        }
      }
      return `<tr>
        <td class="num">${idx + 1}</td>
        <td class="desc-cell"><strong>${itemMaster?.name || ''}</strong>${batchInfo}</td>
        <td class="num">${hsnCode}</td>
        <td class="num">${Number(item.quantity).toFixed(2)} ${unit}</td>
        <td class="num">${formatAmount(Number(item.rate))}</td>
        <td class="unit">${unit}</td>
        <td class="num"><strong>${formatAmount(Number(item.amount))}</strong></td>
      </tr>`;
    }).join('');

    const additionalRows = printableAdditionalLedgers.map(({ entry, ledger }) => {
      const amount = Number(entry.amount || 0);
      const labelPrefix = amount < 0 ? '<span class="less">Less :</span>' : '';
      return `<tr>
        <td></td>
        <td class="desc-cell">${labelPrefix}<span class="adj-ledger">${ledger?.name || ''}</span></td>
        <td></td>
        <td class="num"></td><td class="num"></td><td class="unit"></td>
        <td class="num">${formatAmount(amount)}</td>
      </tr>`;
    }).join('');

    const itemsAmountTotal = inventoryItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const additionalAmountTotal = printableAdditionalLedgers.reduce((sum, x) => sum + Number(x.entry.amount || 0), 0);
    const columnTotalAmount = itemsAmountTotal + additionalAmountTotal;
    const totalQty = inventoryItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    const firstUnit = (() => {
      const first = inventoryItems.find(i => i.item_id);
      const master = first ? items.find(i => i.id === first.item_id) : null;
      return master?.uom_master?.symbol || master?.uom_master?.name || '';
    })();

    const partyLedger = ledgers.find(l => l.id === (voucher.ledger_id));
    const partyName = partyLedger?.name || voucher.ledger_name || '';
    const isSales = ['sales', 'credit-note'].includes(voucher.voucher_type);
    const actualVoucherType = voucher.voucher_type;
    const defaultTitle = isSales
      ? (actualVoucherType === 'credit-note' ? 'CREDIT NOTE' : 'INVOICE')
      : (actualVoucherType === 'debit-note' ? 'DEBIT NOTE' : 'PURCHASE');
    const printTitle = defaultTitle;
    const partyRoleLabel = isSales ? 'Customer (Bill to)' : 'Supplier';

    // Render HTML (copied from frontend)
    const invoiceHtml = `
      <html><head>
        <title>${printTitle} - ${voucher.voucher_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 10px; color: #000; }
          .title { text-align: center; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
          .outer, .items, .bottom, .tax-table { width: 100%; border-collapse: collapse; }
          .outer td, .outer th, .items td, .items th, .bottom td { border: 1px solid #000; vertical-align: top; }
          .tax-table td, .tax-table th { border: 1px solid #000; padding: 4px 6px; font-size: 11px; vertical-align: middle; }
          .tax-table thead th { background: #f0f0f0; font-weight: 600; text-align: center; }
          .tax-table .totals-row td { background: #f9f9f9; }
          .cell-pad { padding: 6px; }
          .label { font-size: 12px; color: #555; }
          .value { font-size: 28px; font-weight: 700; }
          .items th { font-size: 12px; font-weight: 600; text-align: center; padding: 4px; }
          .items td { font-size: 12px; padding: 4px; }
          .num { text-align: right; white-space: nowrap; }
          .unit { text-align: center; white-space: nowrap; }
          .desc-cell { padding-left: 8px; }
          .less { font-style: italic; margin-right: 6px; }
          .adj-ledger { font-weight: 700; font-style: italic; }
          .totals td { font-weight: 700; font-size: 14px; }
          .amount-words { font-size: 13px; font-weight: 700; }
          .sign-box { text-align: right; vertical-align: bottom; height: 80px; }
        </style>
      </head><body>
        <div class="title">${printTitle}</div>
        <table class="outer">
          <tr>
            <td style="width:50%" class="cell-pad" rowspan="2">
              <div class="value">${company?.name || ''}</div>
              <div>State Name : ${(company?.state || '')}, Code : ${(company?.state_code || '')}</div>
              <div>E-Mail : ${(company?.email || '')}</div>
            </td>
            <td style="width:25%" class="cell-pad"><div class="label">Voucher No.</div><div>${voucher.voucher_number}</div></td>
            <td style="width:25%" class="cell-pad"><div class="label">Dated</div><div>${voucher.voucher_date}</div></td>
          </tr>
          <tr>
            <td class="cell-pad"><div class="label">Reference No. &amp; Date</div><div>${voucher.reference_number || ''}</div></td>
            <td class="cell-pad"><div class="label">Other References</div><div>${voucher.reference_date || ''}</div></td>
          </tr>
          <tr>
            <td class="cell-pad" style="height:90px">
              <div class="label">${partyRoleLabel}</div>
              <div class="value">${partyName}</div>
            </td>
            <td colspan="2"></td>
          </tr>
        </table>
        <table class="items">
          <tr>
            <th style="width:4%">Sl<br/>No.</th>
            <th style="width:39%">Description of Goods</th>
            <th style="width:10%">HSN/SAC</th>
            <th style="width:9%">Quantity</th>
            <th style="width:9%">Rate</th>
            <th style="width:5%">per</th>
            <th style="width:14%">Amount</th>
          </tr>
          ${itemRows}
          ${additionalRows}
          <tr class="totals">
            <td></td>
            <td class="num">Total</td>
            <td></td>
            <td class="num">${Number(totalQty).toFixed(2)} ${firstUnit}</td>
            <td></td><td></td>
            <td class="num">${formatAmount(columnTotalAmount, true)}</td>
          </tr>
        </table>
        <table class="bottom">
          <tr>
            <td class="cell-pad">
              <div class="label">Amount Chargeable (in words)</div>
              <div class="amount-words">INR ${numberToWords(columnTotalAmount)}</div>
              <div style="text-align:right;font-size:11px;font-weight:700;margin-top:2px">E. &amp; O.E.</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad">
              ${voucher.narration ? `<div class="label">Narration</div><div style="font-size:12px;margin-bottom:6px">${voucher.narration}</div>` : ''}
              <div class="label">Declaration</div>
              <div style="font-size:11px">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
              <div style="font-size:10px;margin-top:4px;font-style:italic">This is a Computer Generated Invoice</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad sign-box">
              <div style="text-align:right"><strong>for ${company?.name || ''}</strong></div>
              <div style="margin-top:38px;text-align:right">Authorised Signatory</div>
            </td>
          </tr>
        </table>
      </body></html>
    `;
    res.send(invoiceHtml);
  } catch (err) {
    res.status(500).send("Error generating print");
  }
});

// GET /api/vouchers/print/accounting/:id
router.get("/print/accounting/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = (await import("../db.js")).getDb();
    const voucher = await getVoucherById(id);
    if (!voucher) return res.status(404).send("Voucher not found");
    const company = await db.collection("companies").findOne({ id: voucher.company_id });
    const ledgers = await db.collection("ledgers").find({ company_id: voucher.company_id }).toArray();

    // Helper functions (copied from frontend logic)
    function formatAmount(val, withSymbol = false) {
      const abs = Math.abs(Number(val || 0));
      const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const prefixed = `${withSymbol ? '₹ ' : ''}${formatted}`;
      return Number(val) < 0 ? `-${prefixed}` : prefixed;
    }
    function numberToWords(value) {
      const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      function integerToWords(num) {
        if (num < 20) return ones[num];
        if (num < 100) return `${tens[Math.floor(num/10)]}${num%10 ? ` ${ones[num%10]}` : ''}`;
        if (num < 1000) return `${ones[Math.floor(num/100)]} Hundred${num%100 ? ` ${integerToWords(num%100)}` : ''}`;
        if (num < 100000) return `${integerToWords(Math.floor(num/1000))} Thousand${num%1000 ? ` ${integerToWords(num%1000)}` : ''}`;
        if (num < 10000000) return `${integerToWords(Math.floor(num/100000))} Lakh${num%100000 ? ` ${integerToWords(num%100000)}` : ''}`;
        return `${integerToWords(Math.floor(num/10000000))} Crore${num%10000000 ? ` ${integerToWords(num%10000000)}` : ''}`;
      }
      const abs = Math.abs(Number(value) || 0);
      const rupees = Math.floor(abs);
      const paise = Math.round((abs - rupees) * 100);
      return `${value < 0 ? 'Minus ' : ''}${rupees === 0 ? 'Zero' : integerToWords(rupees)} Rupees${paise > 0 ? ` and ${integerToWords(paise)} Paise` : ''} Only`;
    }

    // Prepare ledger entries
    const entries = voucher.entries || [];
    const mainLedger = ledgers.find(l => l.id === (voucher.ledger_id));
    const partyName = mainLedger?.name || voucher.ledger_name || '';
    const isReceipt = voucher.voucher_type === 'receipt';
    const isPayment = voucher.voucher_type === 'payment';
    const isContra = voucher.voucher_type === 'contra';
    const isJournal = voucher.voucher_type === 'journal';
    const printTitle = isReceipt ? 'RECEIPT' : isPayment ? 'PAYMENT' : isContra ? 'CONTRA' : isJournal ? 'JOURNAL' : 'ACCOUNTING VOUCHER';

    // Render HTML (basic, can be improved)
    const html = `
      <html><head>
        <title>${printTitle} - ${voucher.voucher_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 10px; color: #000; }
          .title { text-align: center; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
          .outer, .entries { width: 100%; border-collapse: collapse; }
          .outer td, .outer th, .entries td, .entries th { border: 1px solid #000; vertical-align: top; }
          .cell-pad { padding: 6px; }
          .label { font-size: 12px; color: #555; }
          .value { font-size: 28px; font-weight: 700; }
          .entries th { font-size: 12px; font-weight: 600; text-align: center; padding: 4px; }
          .entries td { font-size: 12px; padding: 4px; }
          .num { text-align: right; white-space: nowrap; }
          .desc-cell { padding-left: 8px; }
          .totals td { font-weight: 700; font-size: 14px; }
          .amount-words { font-size: 13px; font-weight: 700; }
          .sign-box { text-align: right; vertical-align: bottom; height: 80px; }
        </style>
      </head><body>
        <div class="title">${printTitle}</div>
        <table class="outer">
          <tr>
            <td style="width:50%" class="cell-pad" rowspan="2">
              <div class="value">${company?.name || ''}</div>
              <div>State Name : ${(company?.state || '')}, Code : ${(company?.state_code || '')}</div>
              <div>E-Mail : ${(company?.email || '')}</div>
            </td>
            <td style="width:25%" class="cell-pad"><div class="label">Voucher No.</div><div>${voucher.voucher_number}</div></td>
            <td style="width:25%" class="cell-pad"><div class="label">Dated</div><div>${voucher.voucher_date}</div></td>
          </tr>
          <tr>
            <td class="cell-pad"><div class="label">Reference No. &amp; Date</div><div>${voucher.reference_number || ''}</div></td>
            <td class="cell-pad"><div class="label">Other References</div><div>${voucher.reference_date || ''}</div></td>
          </tr>
          <tr>
            <td class="cell-pad" style="height:90px">
              <div class="label">Party</div>
              <div class="value">${partyName}</div>
            </td>
            <td colspan="2"></td>
          </tr>
        </table>
        <table class="entries">
          <tr>
            <th style="width:4%">Sl<br/>No.</th>
            <th style="width:50%">Ledger</th>
            <th style="width:23%">Debit</th>
            <th style="width:23%">Credit</th>
          </tr>
          ${entries.map((e, idx) => {
            const ledger = ledgers.find(l => l.id === e.ledger_id);
            return `<tr><td>${idx + 1}</td><td class="desc-cell">${ledger?.name || e.ledger_name || ''}</td><td class="num">${e.is_debit ? formatAmount(e.amount) : ''}</td><td class="num">${!e.is_debit ? formatAmount(e.amount) : ''}</td></tr>`;
          }).join('')}
        </table>
        <table class="outer">
          <tr>
            <td class="cell-pad">
              <div class="label">Amount (in words)</div>
              <div class="amount-words">INR ${numberToWords(voucher.amount)}</div>
              <div style="text-align:right;font-size:11px;font-weight:700;margin-top:2px">E. &amp; O.E.</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad">
              ${voucher.narration ? `<div class="label">Narration</div><div style="font-size:12px;margin-bottom:6px">${voucher.narration}</div>` : ''}
              <div class="label">Declaration</div>
              <div style="font-size:11px">We declare that this voucher shows the actual particulars and that all are true and correct.</div>
              <div style="font-size:10px;margin-top:4px;font-style:italic">This is a Computer Generated Voucher</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad sign-box">
              <div style="text-align:right"><strong>for ${company?.name || ''}</strong></div>
              <div style="margin-top:38px;text-align:right">Authorised Signatory</div>
            </td>
          </tr>
        </table>
      </body></html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send("Error generating print");
  }
});

// GET /api/vouchers/print/pos/:id
router.get("/print/pos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = (await import("../db.js")).getDb();
    const voucher = await getVoucherById(id);
    if (!voucher) return res.status(404).send("Voucher not found");
    const company = await db.collection("companies").findOne({ id: voucher.company_id });
    const ledgers = await db.collection("ledgers").find({ company_id: voucher.company_id }).toArray();
    const items = await db.collection("item_master").find({ company_id: voucher.company_id }).toArray();

    // Helper functions (copied from frontend logic)
    function formatAmount(val, withSymbol = false) {
      const abs = Math.abs(Number(val || 0));
      const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const prefixed = `${withSymbol ? '₹ ' : ''}${formatted}`;
      return Number(val) < 0 ? `-${prefixed}` : prefixed;
    }
    function numberToWords(value) {
      const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      function integerToWords(num) {
        if (num < 20) return ones[num];
        if (num < 100) return `${tens[Math.floor(num/10)]}${num%10 ? ` ${ones[num%10]}` : ''}`;
        if (num < 1000) return `${ones[Math.floor(num/100)]} Hundred${num%100 ? ` ${integerToWords(num%100)}` : ''}`;
        if (num < 100000) return `${integerToWords(Math.floor(num/1000))} Thousand${num%1000 ? ` ${integerToWords(num%1000)}` : ''}`;
        if (num < 10000000) return `${integerToWords(Math.floor(num/100000))} Lakh${num%100000 ? ` ${integerToWords(num%100000)}` : ''}`;
        return `${integerToWords(Math.floor(num/10000000))} Crore${num%10000000 ? ` ${integerToWords(num%10000000)}` : ''}`;
      }
      const abs = Math.abs(Number(value) || 0);
      const rupees = Math.floor(abs);
      const paise = Math.round((abs - rupees) * 100);
      return `${value < 0 ? 'Minus ' : ''}${rupees === 0 ? 'Zero' : integerToWords(rupees)} Rupees${paise > 0 ? ` and ${integerToWords(paise)} Paise` : ''} Only`;
    }

    // Prepare POS items and ledgers
    const inventoryItems = voucher.inventory || [];
    const partyLedger = ledgers.find(l => l.id === (voucher.ledger_id));
    const partyName = partyLedger?.name || voucher.ledger_name || '';
    const printTitle = 'POS BILL';

    // Render HTML (basic, can be improved)
    const html = `
      <html><head>
        <title>${printTitle} - ${voucher.voucher_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 10px; color: #000; }
          .title { text-align: center; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
          .outer, .items { width: 100%; border-collapse: collapse; }
          .outer td, .outer th, .items td, .items th { border: 1px solid #000; vertical-align: top; }
          .cell-pad { padding: 6px; }
          .label { font-size: 12px; color: #555; }
          .value { font-size: 28px; font-weight: 700; }
          .items th { font-size: 12px; font-weight: 600; text-align: center; padding: 4px; }
          .items td { font-size: 12px; padding: 4px; }
          .num { text-align: right; white-space: nowrap; }
          .unit { text-align: center; white-space: nowrap; }
          .desc-cell { padding-left: 8px; }
          .totals td { font-weight: 700; font-size: 14px; }
          .amount-words { font-size: 13px; font-weight: 700; }
          .sign-box { text-align: right; vertical-align: bottom; height: 80px; }
        </style>
      </head><body>
        <div class="title">${printTitle}</div>
        <table class="outer">
          <tr>
            <td style="width:50%" class="cell-pad" rowspan="2">
              <div class="value">${company?.name || ''}</div>
              <div>State Name : ${(company?.state || '')}, Code : ${(company?.state_code || '')}</div>
              <div>E-Mail : ${(company?.email || '')}</div>
            </td>
            <td style="width:25%" class="cell-pad"><div class="label">Voucher No.</div><div>${voucher.voucher_number}</div></td>
            <td style="width:25%" class="cell-pad"><div class="label">Dated</div><div>${voucher.voucher_date}</div></td>
          </tr>
          <tr>
            <td class="cell-pad"><div class="label">Reference No. &amp; Date</div><div>${voucher.reference_number || ''}</div></td>
            <td class="cell-pad"><div class="label">Other References</div><div>${voucher.reference_date || ''}</div></td>
          </tr>
          <tr>
            <td class="cell-pad" style="height:90px">
              <div class="label">Customer</div>
              <div class="value">${partyName}</div>
            </td>
            <td colspan="2"></td>
          </tr>
        </table>
        <table class="items">
          <tr>
            <th style="width:4%">Sl<br/>No.</th>
            <th style="width:39%">Description of Goods</th>
            <th style="width:10%">HSN/SAC</th>
            <th style="width:9%">Quantity</th>
            <th style="width:9%">Rate</th>
            <th style="width:5%">per</th>
            <th style="width:14%">Amount</th>
          </tr>
          ${inventoryItems.map((item, idx) => {
            const master = items.find(i => i.id === item.item_id);
            return `<tr><td>${idx + 1}</td><td class="desc-cell">${master?.name || item.item_name || ''}</td><td class="num">${master?.hsn_sac || ''}</td><td class="num">${item.quantity || ''}</td><td class="num">${formatAmount(item.rate)}</td><td class="unit">${master?.uom_master?.symbol || master?.uom_master?.name || ''}</td><td class="num">${formatAmount(item.amount)}</td></tr>`;
          }).join('')}
        </table>
        <table class="outer">
          <tr>
            <td class="cell-pad">
              <div class="label">Amount (in words)</div>
              <div class="amount-words">INR ${numberToWords(voucher.amount)}</div>
              <div style="text-align:right;font-size:11px;font-weight:700;margin-top:2px">E. &amp; O.E.</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad">
              ${voucher.narration ? `<div class="label">Narration</div><div style="font-size:12px;margin-bottom:6px">${voucher.narration}</div>` : ''}
              <div class="label">Declaration</div>
              <div style="font-size:11px">We declare that this bill shows the actual particulars and that all are true and correct.</div>
              <div style="font-size:10px;margin-top:4px;font-style:italic">This is a Computer Generated Bill</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad sign-box">
              <div style="text-align:right"><strong>for ${company?.name || ''}</strong></div>
              <div style="margin-top:38px;text-align:right">Authorised Signatory</div>
            </td>
          </tr>
        </table>
      </body></html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send("Error generating print");
  }
});

// GET /api/vouchers/report/held-pos?companyId=...
// Returns all POS vouchers with optional=true (held/on-hold bills)
router.get("/report/held-pos", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId required" });
    }
    const db = (await import("../db.js")).getDb();
    const data = await db.collection("vouchers").find({
      company_id: String(companyId),
      is_pos: true,
      optional: true,
    }).sort({ created_at: -1 }).toArray();
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/held-pos error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/history?companyId=...&dateFrom=...&dateTo=...&voucherType=...
// MUST be before /:id route to prevent /:id catching "report"
router.get("/report/history", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo, voucherType, voucherTypeId } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getVoucherHistory(
      companyId,
      dateFrom,
      dateTo,
      voucherType,
      voucherTypeId,
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/history error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId)
      return res
        .status(400)
        .json({ success: false, message: "companyId required" });
    const voucherType = req.query.voucherType;
    const ledgerId = req.query.ledgerId;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;

    console.log("[VOUCHERS ROUTE] GET / called with:", {
      companyId,
      voucherType,
      ledgerId,
      dateFrom,
      dateTo,
    });

    const data = await getVouchersByCompany(
      String(companyId),
      voucherType,
      ledgerId,
      dateFrom,
      dateTo,
    );

    console.log("[VOUCHERS ROUTE] Returning", data.length, "vouchers");
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/has-pos-vouchers?companyId=X&voucherTypeId=Y
// Check if any vouchers exist for a specific POS voucher type
router.get("/has-pos-vouchers", async (req, res) => {
  try {
    const { companyId, voucherTypeId } = req.query;
    if (!companyId || !voucherTypeId) {
      return res.status(400).json({ success: false, message: "companyId and voucherTypeId required" });
    }
    const db = getDb();
    const count = await db.collection("vouchers").countDocuments({
      company_id: String(companyId),
      voucher_type_id: String(voucherTypeId),
    });
    res.json({ success: true, hasVouchers: count > 0, count });
  } catch (error) {
    console.error("has-pos-vouchers check error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getVoucherById(id);
    if (!data)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = req.body;
    const created = await createVoucherWithDetails(payload);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("POST /api/vouchers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateVoucherWithDetails(id, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/vouchers/:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteVoucher(id);
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/vouchers/:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/sales-register?companyId=...&dateFrom=...&dateTo=...
router.get("/report/sales-register", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getSalesRegister(companyId, dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/sales-register error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/purchase-register?companyId=...&dateFrom=...&dateTo=...
router.get("/report/purchase-register", async (req, res) => {
  try {
    const { companyId, dateFrom, dateTo } = req.query;
    if (!companyId || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: "companyId, dateFrom, and dateTo required",
      });
    }
    const data = await getPurchaseRegister(companyId, dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/purchase-register error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/stock-summary?companyId=...
router.get("/report/stock-summary", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }
    const data = await getStockSummary(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/vouchers/report/stock-summary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/outstanding-receivables?companyId=...
router.get("/report/outstanding-receivables", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }
    const data = await getOutstandingReceivables(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error(
      "GET /api/vouchers/report/outstanding-receivables error:",
      error,
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/outstanding-payables-debug?companyId=...
router.get("/report/outstanding-payables-debug", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }

    const { getDb } = await import("../db.js");
    const db = getDb();

    // Get creditor groups
    const creditorGroups = await db
      .collection("groups")
      .find({
        company_id: companyId,
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();

    // Get supplier ledgers
    const groupIds = creditorGroups.map((g) => g.id);
    const suppliers = await db
      .collection("ledgers")
      .find({
        company_id: companyId,
        group_id: { $in: groupIds },
      })
      .toArray();

    // Get bills from bills collection
    const ledgerIds = suppliers.map((s) => s.id);
    const bills = await db
      .collection("bills")
      .find({
        company_id: companyId,
        ledger_id: { $in: ledgerIds },
        source: "ledger-opening",
      })
      .toArray();

    // Get opening-style entries from voucher documents (embedded ledger_entries)
    const openingVouchers = await db
      .collection("vouchers")
      .find({
        company_id: companyId,
        voucher_type: "opening",
      })
      .toArray();

    const entries = openingVouchers.flatMap((v) =>
      (Array.isArray(v.ledger_entries) ? v.ledger_entries : [])
        .filter(
          (e) =>
            ledgerIds.includes(e.ledger_id) &&
            Array.isArray(e.billallocation) &&
            e.billallocation.length > 0,
        )
        .map((e) => ({
          ledger_id: e.ledger_id,
          billallocation: e.billallocation,
        })),
    );

    res.json({
      success: true,
      debug: {
        creditorGroups: creditorGroups.length,
        suppliers: suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          is_billwise: s.is_billwise,
        })),
        bills: {
          count: bills.length,
          samples: bills.slice(0, 3).map((b) => ({
            bill_reference: b.bill_reference,
            allocated_amount: b.allocated_amount,
            isDeemedPositive: b.isDeemedPositive,
            source: b.source,
            ledger_id: b.ledger_id,
          })),
        },
        entries: {
          count: entries.length,
          samples: entries.slice(0, 2).map((e) => ({
            ledger_id: e.ledger_id,
            billcount: e.billallocation?.length,
          })),
        },
      },
    });
  } catch (error) {
    console.error(
      "GET /api/vouchers/report/outstanding-payables-debug error:",
      error,
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vouchers/report/outstanding-payables?companyId=...
router.get("/report/outstanding-payables", async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId required",
      });
    }
    const data = await getOutstandingPayables(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error(
      "GET /api/vouchers/report/outstanding-payables error:",
      error,
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
