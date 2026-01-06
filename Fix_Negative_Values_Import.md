# CRITICAL BUG FIX: Negative Values Not Importing Correctly

## Problem Statement

**Negative expense values** (refunds, reimbursements, credits) are being imported as **positive values**, causing the total to be inflated.

### Example from August 2025:

| Description | Excel Value | Amigo Value | Problem |
|-------------|-------------|-------------|---------|
| Pagamento Lena | **-€70.00** | €70.00 | Missing negative sign! |
| Casino | **-€10.00** | €10.00 | Missing negative sign! |
| Reembolso placa madeira | **-€32.00** | €32.00 | Missing negative sign! |

**Impact**: 
- Should be: -€112 (credits)
- Actually imported: +€112 (expenses)
- **Total swing**: €224 error in monthly total
- This explains the €255.70 difference (€224 from negatives + ~€32 from other issues)

## Root Cause

The Excel importer is likely:
1. Reading negative values correctly from the Excel file
2. But using `abs()` or similar function somewhere that strips the sign
3. OR treating all cost values as positive by default
4. OR the database schema doesn't support negative amounts

## Required Fixes

### 1. Preserve Negative Values During Import

```python
def import_expense(row):
    # BEFORE (WRONG):
    amount = abs(float(row['cost']))  # ❌ This strips negatives!
    
    # AFTER (CORRECT):
    amount = float(row['cost'])  # ✓ Preserve sign
    
    # Validate it's a number but DON'T force it positive
    if not isinstance(amount, (int, float)):
        raise ValueError(f"Invalid amount: {row['cost']}")
    
    # Negative values are VALID and represent refunds/credits
    return {
        'description': row['description'],
        'amount': amount,  # Can be negative!
        'date': row['date'],
        'type': row['type']
    }
```

### 2. Database Schema Check

Ensure the database allows negative values:

```sql
-- Check if amount column has CHECK constraint
-- BAD:
CREATE TABLE expenses (
    amount DECIMAL(10,2) CHECK (amount > 0)  -- ❌ Rejects negatives!
);

-- GOOD:
CREATE TABLE expenses (
    amount DECIMAL(10,2)  -- ✓ Allows any value including negative
);
```

If there's a CHECK constraint preventing negatives, **remove it**:

```sql
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS amount_positive_check;
```

### 3. Handle Negative Values in UI

The Amigo app UI should:

```javascript
// Display negative amounts differently
function formatAmount(amount) {
    if (amount < 0) {
        // Show as green/credit or with (parentheses)
        return `(€${Math.abs(amount).toFixed(2)})`;  // Accounting style
        // OR
        return `<span class="credit">-€${Math.abs(amount).toFixed(2)}</span>`;
    } else {
        return `€${amount.toFixed(2)}`;
    }
}

// When calculating totals
function calculateMonthTotal(expenses) {
    // Sum should handle negatives naturally
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
    // If expense.amount = -70, this correctly subtracts it!
}
```

### 4. Validation Rules

Add validation to **detect** but **accept** negative values:

```python
def validate_expense(expense):
    """
    Validate expense before import.
    """
    amount = expense['amount']
    
    # Check it's a valid number
    if not isinstance(amount, (int, float)):
        raise ValueError(f"Amount must be numeric: {amount}")
    
    # Allow negatives, but LOG them for review
    if amount < 0:
        logging.info(f"⚠️  Negative amount detected: {expense['description']} = €{amount}")
        logging.info(f"   This is likely a refund/credit/reimbursement")
        
        # IMPORTANT: Don't reject it! Just log it.
        # Negative values are VALID
    
    # Warn if amount is exactly zero (unusual)
    if amount == 0:
        logging.warning(f"Zero amount expense: {expense['description']}")
    
    return True  # Accept the expense
```

## Testing

After fixing, verify these test cases:

### Test Case 1: Simple Negative Import
```python
test_expense = {
    'description': 'Refund from store',
    'amount': -25.50,
    'date': '2025-08-15',
    'type': 'Est'
}

imported = import_expense(test_expense)
assert imported['amount'] == -25.50, "Negative value should be preserved!"
```

### Test Case 2: Month Total with Negatives
```python
august_expenses = [
    {'description': 'Groceries', 'amount': 100.00},
    {'description': 'Refund', 'amount': -25.00},
    {'description': 'Gas', 'amount': 50.00}
]

total = sum(e['amount'] for e in august_expenses)
assert total == 125.00, "Total should be 100 - 25 + 50 = 125"
```

### Test Case 3: August 2025 Real Data
```python
# Import August 2025 Excel file
result = import_excel("Expenses_-_Agosto_2025.xlsx")

# Check specific negative values were imported correctly
pagamento_lena = find_expense(result, "Pagamento Lena")
assert pagamento_lena['amount'] == -70.00, "Should be negative!"

casino = find_expense(result, "Casino") 
assert casino['amount'] == -10.00, "Should be negative!"

reembolso = find_expense(result, "Reembolso placa madeira")
assert reembolso['amount'] == -32.00, "Should be negative!"

# Check total
total = sum(e['amount'] for e in result['expenses'])
assert abs(total - 8476.69) < 0.01, f"Total should be €8,476.69, got €{total:.2f}"
```

## Common Patterns for Negative Expenses

These descriptions typically indicate negative values (credits):
- "Reembolso" (refund)
- "Pagamento" to someone (paying them back)
- "Devolvido" (returned)
- "Crédito" (credit)
- "Casino" (if you won!)
- "Desconto" (discount - though usually applied to another purchase)

The importer could **auto-detect** these and warn if they're positive:

```python
CREDIT_KEYWORDS = ['reembolso', 'pagamento', 'devolvido', 'crédito', 'desconto']

def validate_amount_sign(description, amount):
    """
    Warn if amount sign doesn't match description.
    """
    desc_lower = description.lower()
    
    # If description suggests a credit but amount is positive
    if any(keyword in desc_lower for keyword in CREDIT_KEYWORDS):
        if amount > 0:
            logging.warning(
                f"⚠️  '{description}' suggests a credit but amount is positive (€{amount}). "
                f"Should this be negative?"
            )
```

## Display Guidelines

In the Amigo app UI:

### Monthly View
```
Agosto 2025                              Total: €8,476.69
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Fixed Monthly Costs]
Spotify                                         €14.00
Pagamento Duster                               €373.95
...

[Dated Expenses]
01 Aug  Continente                              €54.00
08 Aug  50% das janelas novas                €2,276.38
21 Aug  Reembolso placa madeira               (€32.00)  ← In parentheses or green
23 Aug  Casino                                 (€10.00)  ← Shows it's a credit
29 Aug  Pagamento Lena                         (€70.00)  ← Clearly negative
```

### Category/Tag Display
Consider adding a "Credits/Refunds" category that automatically groups negative expenses.

## Summary of Changes Needed

1. ✅ **Remove any `abs()` calls** on amount values during import
2. ✅ **Remove database CHECK constraints** that prevent negative amounts  
3. ✅ **Update UI** to display negative amounts distinctly (parentheses, green, or minus sign)
4. ✅ **Add logging** to track negative value imports (not reject them)
5. ✅ **Add validation tests** to ensure negatives import correctly
6. ✅ **Update total calculations** to handle negatives (should already work if you're using `sum()`)

## Priority

**🔴 CRITICAL - FIX IMMEDIATELY**

This bug is causing:
- Incorrect monthly totals (€255+ error in August alone)
- Misleading financial tracking
- Unable to properly track refunds and reimbursements

The fix should be simple (remove one `abs()` call and maybe a CHECK constraint), but it's causing significant data accuracy issues.
