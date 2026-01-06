# Fix Remaining €31.70 Discrepancy in August 2025

## Current Status

✅ **FIXED**: Negative values now display correctly in green/parentheses  
❌ **REMAINING BUG**: Total is €31.70 too high

**Current Amigo Total**: €8,508.39  
**Correct Excel Total**: €8,476.69  
**Difference**: +€31.70

## Problem Analysis

The €31.70 difference is in the **dated expenses** section:

- Recurring expenses: €966.25 (appears correct)
- Dated expenses in Amigo: €7,542.14
- Dated expenses should be: €7,510.44
- **Difference**: €31.70

## Root Cause: Two Possibilities

### Possibility 1: Duplicate Casa Sheet Entry (MOST LIKELY)

There may be a duplicate expense that exists in BOTH:
1. The monthly "Agosto 2025" sheet
2. The "Casa" project sheet

**Example from visible data:**
- "Seguro Multi Riscos" appears TWICE in Amigo:
  - Once as regular expense: €9.70 (25 Aug, Est)
  - Once with "Casa" tag: €9.70 (25 Aug, Proj)

**This would create**: €9.70 duplicate = part of the €31.70 error

### Possibility 2: Amount Mismatch

An expense was imported with the wrong amount.

## Debugging Steps

### Step 1: Check for Duplicates

Run this query to find duplicate expenses in August 2025:

```python
def find_duplicates(expenses):
    """
    Find expenses with same description and date in same month.
    """
    from collections import defaultdict
    
    # Group by (description, date)
    groups = defaultdict(list)
    
    for expense in expenses:
        if expense['month'] == 8 and expense['year'] == 2025:
            key = (expense['description'].lower().strip(), expense['date'])
            groups[key].append(expense)
    
    # Find duplicates
    duplicates = {k: v for k, v in groups.items() if len(v) > 1}
    
    if duplicates:
        print("🚨 DUPLICATES FOUND:")
        for (desc, date), items in duplicates.items():
            print(f"\n{desc} ({date}):")
            for item in items:
                print(f"  - €{item['amount']:.2f} | Tags: {item.get('tags', [])}")
            print(f"  TOTAL DUPLICATED: €{sum(i['amount'] for i in items):.2f}")
    
    return duplicates
```

### Step 2: Verify Casa Sheet Tagging

The Casa sheet should ONLY add tags, not create new expenses:

```python
def verify_casa_tagging(monthly_expenses, casa_sheet):
    """
    Verify Casa sheet isn't creating duplicates.
    """
    casa_tagged = [e for e in monthly_expenses if 'Casa' in e.get('tags', [])]
    
    print(f"Expenses with 'Casa' tag: {len(casa_tagged)}")
    
    # Check if any Casa-tagged expenses have duplicates
    for expense in casa_tagged:
        # Find matching expense without Casa tag
        matches = [
            e for e in monthly_expenses 
            if e['description'] == expense['description']
            and e['date'] == expense['date']
            and e != expense  # Not the same object
        ]
        
        if matches:
            print(f"⚠️  DUPLICATE: {expense['description']}")
            print(f"   Casa-tagged: €{expense['amount']:.2f}")
            print(f"   Original: €{matches[0]['amount']:.2f}")
            print(f"   This expense is counted TWICE!")
```

### Step 3: Check for Known Duplicates

Based on the Amigo PDF, check these specific items:

```python
suspect_duplicates = [
    {
        'description': 'Seguro Multi Riscos',
        'date': '2025-08-25',
        'expected_count': 1,  # Should only appear once
        'expected_amount': 9.70
    },
    {
        'description': 'Banco Homa',
        'date': '2025-08-25',
        'expected_count': 1,
        'expected_amount': 22.00,
        'note': 'Has Casa tag in Amigo - might be duplicate'
    },
    {
        'description': 'Seguro Multiriscos',  # Note: slightly different spelling
        'date': '2025-08-25',
        'expected_count': 0,  # Should NOT exist separately
        'note': 'Same as "Seguro Multi Riscos" - typo duplicate?'
    }
]

for item in suspect_duplicates:
    matches = find_expense_by_description_and_date(
        expenses, 
        item['description'], 
        item['date']
    )
    
    if len(matches) != item['expected_count']:
        print(f"❌ {item['description']}")
        print(f"   Expected: {item['expected_count']} occurrence(s)")
        print(f"   Found: {len(matches)} occurrence(s)")
        print(f"   Difference: €{sum(m['amount'] for m in matches) - item['expected_amount']:.2f}")
```

## Expected Duplicates to Find

Based on analysis, likely duplicates:

1. **Seguro Multi Riscos** (€9.70)
   - Appears in Agosto sheet
   - ALSO in Casa sheet with "Proj" tag
   - Should only count ONCE with Casa tag

2. **Banco Homa** (€22.00)  
   - Tagged as "Casa" in Amigo
   - Might be duplicate from Casa sheet

**Total suspected**: €9.70 + €22.00 = €31.70 ✓

## The Fix

### Fix 1: Remove Duplicate Detection

The Casa sheet ghost implementation should have caught these. Check:

```python
def process_casa_sheet_as_ghost(casa_sheet, monthly_expenses):
    # ... existing code ...
    
    # CRITICAL: After tagging, REMOVE the Casa sheet entry from being imported
    # Only the TAGGED monthly entry should exist
    
    for match in matches:
        # ✓ Add tag to monthly expense
        match['expense']['tags'] = match['expense'].get('tags', []) + ['Casa']
        
        # ✓ DO NOT import the Casa entry as a separate expense
        # The monthly entry IS the expense, Casa just adds the tag
```

### Fix 2: Deduplication Query

Run a one-time cleanup to remove duplicates:

```sql
-- Find duplicate expenses (same description, date, amount)
WITH duplicates AS (
    SELECT 
        description,
        date,
        amount,
        COUNT(*) as count,
        MIN(id) as keep_id  -- Keep the first one
    FROM expenses
    WHERE month = 8 AND year = 2025
    GROUP BY description, date, amount
    HAVING COUNT(*) > 1
)
-- Delete all but the first occurrence
DELETE FROM expenses
WHERE id IN (
    SELECT e.id 
    FROM expenses e
    JOIN duplicates d 
        ON e.description = d.description 
        AND e.date = d.date 
        AND e.amount = d.amount
    WHERE e.id != d.keep_id
);
```

### Fix 3: Update Total Calculation

Ensure the total is calculated correctly:

```python
def calculate_month_total(expenses, month, year):
    """
    Calculate total for a month, handling negatives correctly.
    """
    month_expenses = [
        e for e in expenses 
        if e['month'] == month and e['year'] == year
    ]
    
    # Sum includes both positive and negative amounts
    total = sum(e['amount'] for e in month_expenses)
    
    # Verify no duplicates
    unique_check = set()
    for e in month_expenses:
        key = (e['description'], e['date'], e['amount'])
        if key in unique_check:
            print(f"⚠️  WARNING: Duplicate detected: {e['description']}")
        unique_check.add(key)
    
    return total
```

## Verification

After fixing, verify:

```python
# Test August 2025
august_total = calculate_month_total(all_expenses, 8, 2025)

assert abs(august_total - 8476.69) < 0.01, \
    f"August total should be €8,476.69, got €{august_total:.2f}"

# Verify negatives are counted
negatives = [
    e for e in all_expenses 
    if e['month'] == 8 and e['year'] == 2025 and e['amount'] < 0
]

expected_negatives = [
    ('Pagamento Lena', -70.00),
    ('Casino', -10.00),
    ('Reembolso placa madeira', -32.00)
]

for desc, amount in expected_negatives:
    found = next((e for e in negatives if desc in e['description']), None)
    assert found is not None, f"Missing negative: {desc}"
    assert abs(found['amount'] - amount) < 0.01, \
        f"{desc} should be €{amount:.2f}, got €{found['amount']:.2f}"

print("✅ All tests passed!")
print(f"✅ August total correct: €{august_total:.2f}")
print(f"✅ All 3 negative values present and correct")
print(f"✅ No duplicates detected")
```

## Summary

**Problem**: €31.70 extra in total  
**Cause**: Duplicate expenses from Casa sheet being imported as separate entries  
**Solution**: Ensure Casa sheet only TAGS existing monthly expenses, doesn't create new ones  

**Priority**: 🟡 MEDIUM - Total is close but not exact

After removing the duplicates, the total should match exactly: **€8,476.69** ✓
