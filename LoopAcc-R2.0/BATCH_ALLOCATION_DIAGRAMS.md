# Batch Allocation System - Visual Diagrams & Architecture

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                         │
│                                                                   │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│    │ Item Master  │  │   Vouchers   │  │   Reports    │        │
│    │  Service     │  │  Service     │  │  Service     │        │
│    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│           │                 │                  │                 │
└───────────┼─────────────────┼──────────────────┼─────────────────┘
            │                 │                  │
            └─────────────────┼──────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│                   BATCH ALLOCATION SERVICE                      │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Read Operations:                                       │   │
│  │ • getBatchAllocationsByItem()      → List batches     │   │
│  │ • getBatchWiseStock()               → Stock report    │   │
│  │ • getItemTotalStock()               → Item summary    │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │ Create Operations:                                     │   │
│  │ • createBatchAllocation()           → Single batch    │   │
│  │ • createBatchAllocations()          → Multiple        │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │ Update Operations:                                     │   │
│  │ • addBatchInward(qty, rate)         → Accumulate     │   │
│  │ • addBatchOutward(qty, rate)        → Accumulate     │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │ Reverse Operations:                                    │   │
│  │ • reverseBatchInward(qty, rate)     → Undo purchase  │   │
│  │ • reverseBatchOutward(qty, rate)    → Undo sale      │   │
│  │ • reverseBatchMovement(type,qty,rt) → Generic        │   │
│  │ • deleteBatchIfEmpty()               → Cleanup       │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    MONGODB DATABASE                             │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  batch_allocation Collection                          │    │
│  │  ─────────────────────────────────────────────────────│    │
│  │  Fields:                                              │    │
│  │  • id (UUID)                                          │    │
│  │  • item_id, company_id, batch_number                 │    │
│  │  • opening_qty, opening_rate, opening_value          │    │
│  │  • inward_qty, inward_rate, inward_value             │    │
│  │  • outward_qty, outward_rate, outward_value          │    │
│  │  • closing_qty, closing_rate, closing_value          │    │
│  │                                                       │    │
│  │  Indexes:                                            │    │
│  │  ✓ UNIQUE (item_id, batch_number, company_id)       │    │
│  │  ✓ (item_id, company_id)                             │    │
│  │  ✓ (company_id)                                       │    │
│  └───────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Batch Quantity Flow Diagram

```
                       OPENING BALANCE
                       (From Item Master)
                            │
                            ▼
                    ┌────────────────┐
                    │   Opening Qty  │
                    │       100      │
                    └────────┬───────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    │                    ▼
   INWARD (⬆️)           NO CHANGE            OUTWARD (⬇️)

   Purchase:          (Initial State)        Sales:
   +50 @ 6              [Fixed]             -30 @ 8
        │                 │                    │
        ▼                 ▼                    ▼
   Inward Qty:      Closing Qty:         Outward Qty:
   100 → 150       100 + 150 - 30      0 → 30
                        = 220

                       CLOSING BALANCE
                            120

  Formula: Closing = Opening + Inward - Outward
           120     =   100   +  150   -  30
```

---

## 3. Data State Transitions

```
CREATE BATCH (Opening Balance)
─────────────────────────────
Initial State:
  opening_qty: 100      inward_qty: 100       outward_qty: 0
  closing_qty: 100      closing_rate: 5.00    closing_value: 500

AFTER PURCHASE +50 @ 6
─────────────────────
  opening_qty: 100      inward_qty: 150       outward_qty: 0
  inward_rate: 5.33     inward_value: 800
  closing_qty: 250      closing_rate: 3.20    closing_value: 800

AFTER SALE -30 @ 8
──────────────────
  opening_qty: 100      inward_qty: 150       outward_qty: 30
  outward_rate: 8.00    outward_value: 240
  closing_qty: 220      closing_rate: 2.33    closing_value: 514

AFTER UNDO SALE -20
───────────────────
  opening_qty: 100      inward_qty: 150       outward_qty: 10
  outward_rate: 8.00    outward_value: 80
  closing_qty: 240      closing_rate: 2.92    closing_value: 700

DELETE BATCH (if closing_qty <= 0)
──────────────────────────────────
  ✓ DELETED if closing_qty = 0
  ✗ NOT DELETED if closing_qty > 0
```

---

## 4. Multi-Batch Per Item Visualization

```
ITEM: Paracetamol 500mg
├─ BATCH B001 (Jan 2024)
│  ├─ Opening: 100 @ 5.00 = 500
│  ├─ Inward: 50 @ 6.00 = 300
│  ├─ Outward: 30 @ 8.00 = 240
│  └─ Closing: 120 @ 3.58 = 430
│
├─ BATCH B002 (Feb 2024)
│  ├─ Opening: 80 @ 4.50 = 360
│  ├─ Inward: 0
│  ├─ Outward: 20 @ 8.00 = 160
│  └─ Closing: 60 @ 3.33 = 200
│
└─ BATCH B003 (Mar 2024)
   ├─ Opening: 50 @ 5.50 = 275
   ├─ Inward: 30 @ 6.00 = 180
   ├─ Outward: 0
   └─ Closing: 80 @ 5.69 = 455

TOTAL FOR PARACETAMOL:
├─ Total Opening: 230
├─ Total Inward: 80
├─ Total Outward: 50
└─ Total Closing: 260 @ 4.12 = 1,085
```

---

## 5. Same Batch Number Across Items

```
WAREHOUSE INVENTORY

Item A: Paracetamol 500mg        Item B: Aspirin 75mg
┌──────────────────────────┐     ┌──────────────────────────┐
│ Batch "2024-JAN"         │     │ Batch "2024-JAN"         │
├──────────────────────────┤     ├──────────────────────────┤
│ Opening: 100 @ 5         │     │ Opening: 200 @ 3         │
│ Inward: 50 @ 6           │     │ Inward: 100 @ 3.50       │
│ Outward: 30 @ 8          │     │ Outward: 80 @ 8          │
│ Closing: 120             │     │ Closing: 220             │
└──────────────────────────┘     └──────────────────────────┘

In Database:
┌─────────────────────────────────────────────────┐
│ batch_allocation Collection                     │
├─────────────────────────────────────────────────┤
│ Record 1:                                       │
│   item_id: "para-id"                           │
│   batch_number: "2024-JAN"                     │
│   closing_qty: 120                             │
├─────────────────────────────────────────────────┤
│ Record 2:                                       │
│   item_id: "aspr-id"                           │
│   batch_number: "2024-JAN"  ← SAME, but OK     │
│   closing_qty: 220                             │
└─────────────────────────────────────────────────┘

Unique Index: (item_id, batch_number, company_id)
Prevents duplicates PER ITEM, not globally
```

---

## 6. Voucher Transaction Mapping

```
                    VOUCHER TYPES
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    ┌────────┐      ┌────────┐     ┌────────┐
    │Purchase│      │ Sales  │     │Debit   │
    │Voucher │      │Voucher │     │Note    │
    └────┬───┘      └───┬────┘     └───┬────┘
         │              │              │
         ▼              ▼              ▼
    INWARD (⬆️)    OUTWARD (⬇️)   INWARD (⬆️)
    Add to Stock  Remove Stock   Add to Stock

    ┌───────────────────────────────────────┐
    │ Credit Note                           │
    └───────────────┬───────────────────────┘
                    │
                    ▼
                OUTWARD (⬇️)
              Remove Stock

MAPPING:
┌──────────────────┬──────────────────┬─────────────────┐
│ Voucher Type     │ Movement         │ Method          │
├──────────────────┼──────────────────┼─────────────────┤
│ Purchase         │ INWARD (⬆️)      │ addBatchInward()│
│ Sales            │ OUTWARD (⬇️)     │ addBatchOutward│
│ Debit Note       │ INWARD (⬆️)      │ addBatchInward()│
│ Credit Note      │ OUTWARD (⬇️)     │ addBatchOutward│
└──────────────────┴──────────────────┴─────────────────┘
```

---

## 7. Weighted Average Rate Calculation

```
Batch Timeline:

Day 1: Opening 100 units @ 5.00
┌────────────────────┐
│ Total Value: 500   │
│ Total Qty: 100     │
│ Rate: 5.00         │
└────────────────────┘

Day 5: Purchase +50 units @ 6.00
┌─────────────────────────────────┐
│ Previous Value:  500             │
│ New Purchase:    300 (50×6)      │
│ Total Value:     800             │
│ Total Qty:       150             │
│ New Rate: 800÷150 = 5.33 (WA)   │
└─────────────────────────────────┘

Day 10: Sale -80 units @ 8.00
┌─────────────────────────────────┐
│ Remaining Value: 800 - 640 = 160│
│ Remaining Qty: 150 - 80 = 70    │
│ Closing Rate: 160÷70 = 2.29     │
└─────────────────────────────────┘

Day 15: Undo Sale -40 units
┌─────────────────────────────────┐
│ Restore Value: 160 + 320 = 480  │
│ Restore Qty: 70 + 40 = 110      │
│ Closing Rate: 480÷110 = 4.36    │
└─────────────────────────────────┘
```

---

## 8. Calculation Flow Diagram

```
CREATE BATCH
    │
    ├─ opening_qty = from Item Master
    ├─ opening_rate = from Item Master
    ├─ opening_value = opening_qty × opening_rate
    ├─ inward_qty = opening_qty (initialize)
    ├─ inward_rate = opening_rate
    ├─ inward_value = opening_value
    ├─ outward_qty = 0
    ├─ outward_rate = 0
    ├─ outward_value = 0
    └─ Calculate Closing:
       ├─ closing_qty = opening_qty + inward_qty - outward_qty
       ├─ closing_value = inward_value - outward_value
       └─ closing_rate = closing_value ÷ closing_qty
          (with zero check)

ADD INWARD (Purchase)
    │
    └─ new_inward_qty = inward_qty + purchase_qty
       new_inward_value = inward_value + (purchase_qty × purchase_rate)
       inward_rate = new_inward_value ÷ new_inward_qty
       closing_qty = opening_qty + new_inward_qty - outward_qty
       closing_rate = (new_inward_value - outward_value) ÷ closing_qty
       closing_value = closing_qty × closing_rate

ADD OUTWARD (Sale)
    │
    └─ new_outward_qty = outward_qty + sale_qty
       new_outward_value = outward_value + (sale_qty × sale_rate)
       outward_rate = new_outward_value ÷ new_outward_qty
       closing_qty = opening_qty + inward_qty - new_outward_qty
       closing_rate = (inward_value - new_outward_value) ÷ closing_qty
       closing_value = closing_qty × closing_rate

REVERSE INWARD (Undo Purchase)
    │
    └─ new_inward_qty = inward_qty - purchase_qty
       new_inward_value = inward_value - (purchase_qty × purchase_rate)
       inward_rate = new_inward_value ÷ new_inward_qty
       closing_qty = opening_qty + new_inward_qty - outward_qty
       closing_rate = (new_inward_value - outward_value) ÷ closing_qty
       closing_value = closing_qty × closing_rate

       If closing_qty ≤ 0:
         └─ DELETE BATCH

REVERSE OUTWARD (Undo Sale)
    │
    └─ new_outward_qty = outward_qty - sale_qty
       new_outward_value = outward_value - (sale_qty × sale_rate)
       outward_rate = new_outward_value ÷ new_outward_qty
       closing_qty = opening_qty + inward_qty - new_outward_qty
       closing_rate = (inward_value - new_outward_value) ÷ closing_qty
       closing_value = closing_qty × closing_rate

       If closing_qty ≤ 0:
         └─ DELETE BATCH
```

---

## 9. Batch Status Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  BATCH LIFECYCLE                             │
└─────────────────────────────────────────────────────────────┘

                    [NOT CREATED]
                          │
                          ▼
              [CREATE BATCH] (Opening Balance)
                          │
                    ┌─────┴──────────────┐
                    │                    │
                    ▼                    ▼
            [WITH STOCK]          [ADDED BUT NO MOVEMENT]
            closing_qty > 0                │
                    │                      │
                    ├─ Purchase (+50)      │
                    ├─ Sale (-30)          │
                    ├─ Debit Note (+20)    │
                    └─ Credit Note (-10)   │
                    │                      │
                    │ (All valid)          │
                    │                      │
                    ├─ All movements      │
                    │   ongoing            │
                    │                      │
                    ▼                      │
            [EMPTY STOCK]                 │
            closing_qty = 0               │
                    │                     │
                    └─ DELETE ────────────┘
                    (All lines reversed)


RULES:
─────
✓ Can create: New batch with opening balance
✓ Can add: Any movement (inward/outward) to active batch
✓ Can reverse: Any transaction
✓ Can delete: Only if closing_qty = 0
✓ Cannot: Create duplicate batch (item + batch_number + company)
```

---

## 10. Error Handling Flow

```
ADD MOVEMENT REQUEST
        │
        ▼
┌─────────────────────────┐
│ VALIDATE INPUT          │
├─────────────────────────┤
│ • Check batchId exists  │
│ • Check qty > 0         │
│ • Check rate >= 0       │
└──┬─────────────────┬────┘
   │                 │
   ▼                 ▼
 [PASS]            [FAIL]
   │                 │
   ▼                 ▼
[GET BATCH]        [RETURN ERROR]
   │
   ▼
[CALCULATE]
   │
   ▼
[FOR OUTWARD]
├─ Check closing_qty >= outward_qty requested
   │                 │
   ▼                 ▼
 [PASS]            [INSUFFICIENT STOCK]
   │                 │
   ▼                 ▼
[UPDATE DB]        [RETURN ERROR]
   │                 │
   ▼                 ▼
[VALIDATE RESULT]  [REJECT TRANSACTION]
   │
   ├─ Closing >= 0? YES → [SUCCESS]
   │                        │
   │                        ▼
   │                   [RETURN UPDATED BATCH]
   │
   └─ Closing < 0? → [ROLLBACK & ERROR]
```

---

## 11. Database Index Strategy

```
PRIMARY KEY:
┌────────────────────────────────┐
│ id (UUID) - Primary Key        │
└────────────────────────────────┘

UNIQUE CONSTRAINT:
┌──────────────────────────────────────────────┐
│ (item_id, batch_number, company_id)          │
│                                              │
│ Ensures: One batch_number per item per       │
│          company (NOT globally unique)       │
│                                              │
│ Example:                                     │
│ ✓ Item A batch "B001"                        │
│ ✓ Item B batch "B001" ← Allowed, different   │
│ ✗ Item A batch "B001" (2nd) ← Blocked        │
└──────────────────────────────────────────────┘

QUERY INDEXES:
┌──────────────────────────────────────────────┐
│ (item_id, company_id)                        │
│ Used for: Get all batches for an item        │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ (company_id)                                 │
│ Used for: Get all batches in company         │
└──────────────────────────────────────────────┘

QUERY PERFORMANCE:
┌──────────────────────────────────────────┐
│ Operation              │ Index Used      │
├──────────────────────────────────────────┤
│ Find by batch_id       │ PRIMARY (_id)   │
│ Find by item_id        │ (item_id, co)  │
│ Check duplicates       │ UNIQUE index   │
│ Get company batches    │ (company_id)   │
│ Validate existence     │ UNIQUE index   │
└──────────────────────────────────────────┘
```

---

## 12. Migration Process Flow

```
OLD SYSTEM DATA
      │
      ▼
[BACKUP] ← Creates timestamped copy
      │
      ▼
[MIGRATE EACH BATCH]
├─ Extract opening values
├─ Initialize inward = opening
├─ Preserve outward values
├─ Recalculate closing
├─ Validate all rates
└─ Update in DB
      │
      ▼
[VALIDATE CONSISTENCY]
├─ Check closing = opening + inward - outward
├─ Verify no negative quantities
├─ Validate rates are positive
└─ Generate report
      │
      ├─ [NO ISSUES]
      │   │
      │   ▼
      │ [SUCCESS] ✓
      │
      └─ [ISSUES FOUND]
          │
          ▼
        [REVIEW & MANUAL FIX]
          │
          ▼
        [RETRY VALIDATION]
```

---

## 13. Batch Consolidation Opportunity Detection

```
ITEM: Paracetamol 500mg

Batch Analysis:
┌──────────────────────────────────────────┐
│ Batch   │ Qty   │ Rate  │ Value │ Status │
├──────────────────────────────────────────┤
│ B001    │ 100   │ 5.00  │ 500   │ Active │
│ B002    │ 50    │ 5.00  │ 250   │ Low    │
│ B003    │ 30    │ 5.00  │ 150   │ Low    │
│ B004    │ 10    │ 5.00  │ 50    │ Critical│
└──────────────────────────────────────────┘

Consolidation Opportunity:
┌────────────────────────────────────────────┐
│ Current: 4 batches (190 units)             │
│                                            │
│ Recommendation:                            │
│ ├─ Keep: B001 (100 units)                  │
│ └─ Consolidate: B002 + B003 + B004 (90)   │
│    into single batch with weighted avg     │
│                                            │
│ Benefits:                                  │
│ ├─ Reduce complexity: 4 → 2 batches       │
│ ├─ Easier tracking                         │
│ ├─ Better space utilization               │
│ └─ Same financial impact (weighted avg)   │
└────────────────────────────────────────────┘
```

---

This visual documentation provides quick reference for understanding the Batch Allocation system architecture and data flows.
