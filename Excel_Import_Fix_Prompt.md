# Excel Import Fix - Comprehensive Requirements

## Problem Summary
The Excel expense tracker is not importing correctly into the Amigo expense tracking app. There are significant discrepancies between the Excel totals and the imported totals in Amigo.

**Example Discrepancies:**
- **July 2025**: Excel shows €8,154.80, Amigo shows €9,271.19 (difference: +€1,116.39)
- **August 2025**: Excel shows €8,476.69, Amigo shows €8,620.39 (difference: +€143.70)

## Excel File Structure Analysis

### Sheet Organization
- **Multiple sheets per month** (Janeiro 2026, Dezembro 2025, Novembro 2025, etc.)
- **Special "Casa" sheet** - Contains project-specific expenses (house-related purchases)
- **Template sheet** - "Cópia de Template 2025"
- Each month sheet contains BOTH recurring and one-time expenses

### Column Structure
- **Column A**: Empty (spacer)
- **Column B**: Date (can be datetime object or text like "02/10/0202", or None for recurring expenses)
- **Column C**: Expense Description ("Tipo de Custo")
- **Column D**: Cost ("Custo")

### Row Structure for Each Month Sheet

#### Header Section (Rows 1-3)
- Row 1: Empty
- Row 2: Headers - "Data", "Tipo de Custo", "Custo"
- Row 3: "Total" label with formula `=SUBTOTAL(9, D4:DX)` to sum all expenses

#### Recurring Expenses Section (Rows 4-17 typically)
**CRITICAL**: These rows have **NO DATE** (Column B is empty/None)
These are monthly recurring fixed costs that should be imported ONCE per month:
- Manutenção Conta MEmpresa (€7.50)
- Spotify (€14.00 in older months, €17.00 in newer)
- Contabilista (€123.00)
- Seg Social (€302.33)
- Pagamento Duster (€373.95)
- Prestação Casa (formula: `=436.36-60.38` or `=189.75-44.28`)
- Seguro Casa (€9.70)
- Água (varies, sometimes empty)
- Gás (varies, sometimes formula like `=18.43+23.31`)
- Luz (varies, sometimes empty)
- Condomínio (varies)
- NOS (varies)
- YouTube premium (€10.00 in newer months)
- Manutenção Conta Pessoal Millenium (€3.50 in newer months)

**Row after recurring expenses**: Another subtotal formula `=SUBTOTAL(9, D19:DX)` for dated expenses

#### Dated Expenses Section (Row 19 onwards)
These rows HAVE dates in Column B (datetime objects)
- Example: `datetime.datetime(2025, 7, 1, 0, 0)`, "Peak", 8.00
- These are one-time purchases with specific dates

### Special Cases & Data Quality Issues

#### 1. Formula Values
Some cost cells contain formulas instead of numbers:
- `=436.36-60.38` (Prestação Casa)
- `=189.75-44.28` (Prestação Casa in August)
- `=18.43+23.31` (Gás)
- `=SUBTOTAL(9, D4:DX)` (Total rows - should be IGNORED during import)

**Required**: Evaluate these formulas to get actual numeric values

#### 2. Malformed Dates
Some dates are stored as text strings instead of datetime objects:
- Example: "02/10/0202" in Outubro sheet (obviously wrong - should be 02/10/2025)

**Required**: Parse and validate date strings, correct obvious errors

#### 3. The "Casa" Sheet Problem
The "Casa" sheet contains house-related project expenses with dates from July 2025 onwards.
These expenses also appear in the July monthly sheet WITHOUT dates.

**Example from Casa sheet:**
- Row 4: `datetime(2025, 7, 3)`, "Colchão Amazon", €300.00
- Row 5: None (no date), "Cama IKEA", €350.00
- Row 6: None (no date), "Resguardo Colchão", €16.00

**Problem**: The PDF export from the Excel likely includes these "Casa" sheet expenses, but they may not be properly categorized by month or may be duplicated.

**In Amigo app**, I saw expenses tagged as "Proj" (Project) that match Casa expenses:
- Colchão Amazon: €300.00
- Cama IKEA: €350.00
- Resguardo Colchão: €16.00
- Jogo de Cozinha: €16.95 (note: different from monthly €16.52!)

#### 4. Duplicate Detection
Some expenses appear both:
- In the monthly sheet WITHOUT dates (as recurring/bulk entries)
- In the Casa sheet WITH dates (as project expenses)

**Example**: "Jogo de Cozinha" appears as:
- €16.52 in Julho monthly sheet (no date)
- €16.95 in Casa sheet (dated 09/07/2025)

This creates confusion about which is correct and whether to import both.

## Root Causes of Import Issues

### 1. Recurring Expenses Treated as Dated Expenses
**Current behavior**: Importer may be assigning a default date (like the 1st of the month) to all expenses, even recurring ones.

**Problem**: When there are multiple month sheets, all recurring expenses get imported with dates, causing them to be counted multiple times or assigned to wrong months.

**Solution**: 
- Expenses with empty/None dates should be imported as RECURRING expenses for that specific month
- They should be tagged differently (e.g., type="Fixo" or recurrence="monthly")
- They should NOT be given arbitrary dates

### 2. Casa Sheet Month Assignment
**Current behavior**: Casa sheet expenses may not be assigned to specific months properly.

**Problem**: Casa expenses without dates don't know which month they belong to.

**Solution**:
- Casa sheet expenses WITH dates: assign to the month based on the date
- Casa sheet expenses WITHOUT dates but appearing after a dated entry: assign to the same month as the previous dated entry
- Add a category/tag "Casa" or "Proj" to distinguish these from regular expenses

### 3. Formula Evaluation Failure
**Current behavior**: Formulas in cost cells may not be evaluated, causing import to fail or use wrong values.

**Solution**: Detect and evaluate formulas before import. Skip SUBTOTAL formulas.

### 4. Date Parsing Errors
**Current behavior**: Text dates like "02/10/0202" may crash the importer or be assigned to year 202.

**Solution**: 
- Validate dates are reasonable (year between 2020-2030)
- Parse text dates with error handling
- Reject or correct malformed dates

## Import Strategy - Detailed Requirements

### CRITICAL: Import Order & Flow

```
1. Import Monthly Sheets First (Janeiro → Mar 2025)
   ↓
2. Separate Recurring from Dated Expenses  
   ↓
3. Process Casa Sheet as Ghost Sheet (tag existing expenses)
   ↓
4. Prompt User for Mismatches/Unmatched
   ↓
5. Validate Totals Match Excel
   ↓
6. Import to Amigo
```

### Phase 1: Sheet Selection
```python
sheets_to_import = [
    "Janeiro 2026",
    "Dezembro 2025", 
    "Novembro 2025",
    "Outubro 2025",
    "Setembro 2025",
    "Agosto 2025",
    "Julho 2025",
    "Junho 2025",
    "Maio 2025",
    "Apr 2025",
    "Mar 2025"
]
# DO NOT import "Cópia de Template 2025" - it's empty
# Handle "Casa" separately
```

### Phase 2: Extract Month/Year from Sheet Name
```python
def extract_month_year(sheet_name):
    """
    Extract month and year from sheet name.
    Examples:
    - "Julho 2025" -> (7, 2025)
    - "Apr 2025" -> (4, 2025) 
    - "Janeiro 2026" -> (1, 2026)
    """
    month_map = {
        'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4,
        'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
        'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    }
    # Parse and return (month_num, year)
```

### Phase 3: Process Each Row
For each row starting from row 4:

```python
def process_row(row, sheet_month, sheet_year):
    date_cell = row[1]  # Column B
    description = row[2]  # Column C  
    cost_cell = row[3]  # Column D
    
    # Skip empty rows
    if description is None or cost_cell is None:
        return None
        
    # Skip SUBTOTAL formulas
    if isinstance(cost_cell, str) and 'SUBTOTAL' in cost_cell:
        return None
    
    # Evaluate formula if present
    cost = evaluate_formula(cost_cell) if isinstance(cost_cell, str) and cost_cell.startswith('=') else cost_cell
    
    # Validate cost is numeric
    if not isinstance(cost, (int, float)):
        return None
    
    # Determine expense type and date
    if date_cell is None or not isinstance(date_cell, datetime):
        # RECURRING EXPENSE - belongs to this month, no specific date
        expense_type = "Fixo"  # or "Recorrente"
        # DO NOT assign a date! Or use 1st of month but mark as recurring
        expense_date = None  # Preferred
        # OR: expense_date = date(sheet_year, sheet_month, 1) with recurring flag
    else:
        # DATED EXPENSE
        expense_type = "Est"  # or "Pontual"  
        expense_date = validate_date(date_cell, sheet_year, sheet_month)
        
    return {
        'date': expense_date,
        'description': description,
        'amount': cost,
        'type': expense_type,
        'month': sheet_month,
        'year': sheet_year,
        'category': determine_category(description)  # Auto-categorize if possible
    }
```

### Phase 4: Handle Casa Sheet (GHOST SHEET STRATEGY)
```python
def process_casa_sheet_as_ghost(casa_sheet, all_monthly_expenses):
    """
    Casa sheet is a GHOST SHEET - it only tags existing expenses, doesn't create new ones.
    
    Strategy:
    1. Extract all Casa entries
    2. For each Casa entry, find matching expense in monthly_expenses
    3. If found: Add "Casa" tag to that expense
    4. If not found or amount mismatch: Flag for user review
    """
    casa_entries = []
    current_month = None
    current_year = None
    
    for row in casa_sheet:
        date_cell = row[1]
        description = row[2]
        cost = evaluate_formula(row[3]) if isinstance(row[3], str) else row[3]
        
        if cost is None or description is None:
            continue
            
        # Track month context from dated entries
        if isinstance(date_cell, datetime):
            current_month = date_cell.month
            current_year = date_cell.year
            search_date = date_cell
        else:
            search_date = None
            
        casa_entries.append({
            'description': description,
            'amount': cost,
            'date': search_date,
            'month': current_month,
            'year': current_year
        })
    
    # Match Casa entries to monthly expenses
    matches = []
    unmatched = []
    mismatches = []
    
    for casa_entry in casa_entries:
        # Search for matching expense in monthly sheets
        match = find_matching_expense(
            casa_entry,
            all_monthly_expenses,
            tolerance=1.0  # €1 tolerance for amount differences
        )
        
        if match['status'] == 'EXACT_MATCH':
            # Add "Casa" tag to the monthly expense
            match['expense']['tags'] = match['expense'].get('tags', []) + ['Casa']
            matches.append(match)
            
        elif match['status'] == 'AMOUNT_MISMATCH':
            # Found entry with same description but different amount
            mismatches.append({
                'casa_entry': casa_entry,
                'monthly_entry': match['expense'],
                'amount_diff': abs(casa_entry['amount'] - match['expense']['amount'])
            })
            
        else:  # NO_MATCH
            # Casa entry has no corresponding monthly expense
            unmatched.append(casa_entry)
    
    return {
        'matches': matches,
        'mismatches': mismatches,  # Prompt user to resolve
        'unmatched': unmatched      # Prompt user to add or ignore
    }

def find_matching_expense(casa_entry, monthly_expenses, tolerance=1.0):
    """
    Find matching expense in monthly_expenses.
    
    Matching criteria (in priority order):
    1. Exact: Same description, same amount (±tolerance), same/no date
    2. Description match: Same description, different amount
    3. No match
    """
    description = casa_entry['description'].strip().lower()
    amount = casa_entry['amount']
    search_month = casa_entry['month']
    search_date = casa_entry['date']
    
    # Filter to relevant month first
    candidates = [
        e for e in monthly_expenses 
        if e['month'] == search_month
    ]
    
    # Try exact match first (description + amount)
    for expense in candidates:
        if (expense['description'].strip().lower() == description and
            abs(expense['amount'] - amount) <= tolerance):
            # Exact match!
            return {'status': 'EXACT_MATCH', 'expense': expense}
    
    # Try description-only match
    for expense in candidates:
        if expense['description'].strip().lower() == description:
            # Description matches but amount doesn't
            return {'status': 'AMOUNT_MISMATCH', 'expense': expense}
    
    return {'status': 'NO_MATCH', 'expense': None}

def prompt_user_for_mismatches(mismatches):
    """
    Present mismatches to user for resolution.
    
    For each mismatch, show:
    - Casa entry: Description, Amount
    - Monthly entry: Description, Amount  
    - Difference: €X.XX
    
    Options:
    1. Keep monthly amount (recommended - monthly is source of truth)
    2. Update monthly to Casa amount
    3. Keep separate (they're different expenses)
    4. Skip this entry
    """
    print("\n⚠️  AMOUNT MISMATCHES DETECTED ⚠️")
    print("The following Casa entries don't match their monthly counterparts:\n")
    
    resolutions = []
    for i, mismatch in enumerate(mismatches, 1):
        casa = mismatch['casa_entry']
        monthly = mismatch['monthly_entry']
        diff = mismatch['amount_diff']
        
        print(f"{i}. {casa['description']}")
        print(f"   Casa sheet:    €{casa['amount']:.2f}")
        print(f"   Monthly sheet: €{monthly['amount']:.2f}")
        print(f"   Difference:    €{diff:.2f}")
        print(f"   Suggestion: Keep monthly amount (€{monthly['amount']:.2f})")
        print("\n   Options:")
        print("   1. Keep monthly amount and tag as 'Casa' [RECOMMENDED]")
        print("   2. Update monthly to match Casa amount")
        print("   3. These are different expenses - don't link")
        print("   4. Skip this entry")
        
        choice = input(f"\n   Choose (1-4, default=1): ").strip() or "1"
        
        if choice == "1":
            # Tag monthly expense as Casa, ignore amount difference
            monthly['tags'] = monthly.get('tags', []) + ['Casa']
            resolutions.append({'action': 'TAG_MONTHLY', 'expense': monthly})
        elif choice == "2":
            # Update monthly amount to match Casa
            monthly['amount'] = casa['amount']
            monthly['tags'] = monthly.get('tags', []) + ['Casa']
            resolutions.append({'action': 'UPDATE_MONTHLY', 'expense': monthly})
        elif choice == "3":
            # Don't link them
            resolutions.append({'action': 'SKIP', 'expense': None})
        else:  # "4"
            resolutions.append({'action': 'SKIP', 'expense': None})
        
        print()
    
    return resolutions

def prompt_user_for_unmatched(unmatched):
    """
    Present unmatched Casa entries to user.
    
    These are expenses in Casa sheet that don't exist in any monthly sheet.
    
    Options for each:
    1. Add to appropriate month as new expense with 'Casa' tag
    2. Ignore (might be duplicate or mistake in Casa sheet)
    """
    print("\n⚠️  UNMATCHED CASA ENTRIES ⚠️")
    print("The following expenses are in Casa sheet but not in monthly sheets:\n")
    
    resolutions = []
    for i, entry in enumerate(unmatched, 1):
        print(f"{i}. {entry['description']}")
        print(f"   Amount: €{entry['amount']:.2f}")
        if entry['date']:
            print(f"   Date: {entry['date'].strftime('%d/%m/%Y')}")
        else:
            print(f"   Suggested month: {entry['month']}/{entry['year']}")
        
        print("\n   Options:")
        print("   1. Add to monthly sheet with 'Casa' tag")
        print("   2. Ignore this entry")
        
        choice = input(f"\n   Choose (1-2, default=1): ").strip() or "1"
        
        if choice == "1":
            resolutions.append({
                'action': 'ADD_TO_MONTHLY',
                'expense': {
                    'description': entry['description'],
                    'amount': entry['amount'],
                    'date': entry['date'],
                    'month': entry['month'],
                    'year': entry['year'],
                    'tags': ['Casa'],
                    'type': 'Est' if entry['date'] else 'Fixo'
                }
            })
        else:
            resolutions.append({'action': 'SKIP', 'expense': None})
        
        print()
    
    return resolutions
```

### Phase 5: Smart Duplicate Detection & Resolution
```python
def smart_mismatch_resolution(mismatches):
    """
    Provide smart suggestions for amount mismatches.
    
    Common patterns:
    1. Small rounding differences (€0.01-€0.10) → Auto-resolve to monthly
    2. Exact multiples (€16.52 vs €16.95) → Likely data entry error, suggest monthly
    3. Large differences (>10%) → Flag for manual review
    4. Same item, different date → Might be separate purchases
    """
    auto_resolved = []
    need_user_input = []
    
    for mismatch in mismatches:
        diff = abs(mismatch['casa_entry']['amount'] - 
                   mismatch['monthly_entry']['amount'])
        monthly_amt = mismatch['monthly_entry']['amount']
        percentage_diff = (diff / monthly_amt) * 100 if monthly_amt > 0 else 0
        
        if diff <= 0.10:
            # Small rounding difference - auto-resolve to monthly
            mismatch['resolution'] = 'AUTO_MONTHLY'
            mismatch['reason'] = f'Small rounding difference (€{diff:.2f})'
            auto_resolved.append(mismatch)
            
        elif percentage_diff < 3:
            # Less than 3% difference - likely data entry error
            mismatch['resolution'] = 'SUGGEST_MONTHLY'
            mismatch['reason'] = f'Minor difference ({percentage_diff:.1f}%), likely data entry error'
            need_user_input.append(mismatch)
            
        else:
            # Significant difference - needs review
            mismatch['resolution'] = 'MANUAL_REVIEW'
            mismatch['reason'] = f'Significant difference ({percentage_diff:.1f}%)'
            need_user_input.append(mismatch)
    
    return {
        'auto_resolved': auto_resolved,
        'need_user_input': need_user_input
    }
```

### Phase 6: Data Validation Before Import
```python
def validate_before_import(expenses):
    """
    Checks:
    1. All expenses have valid month/year
    2. All amounts are positive numbers
    3. Dates (if present) are within reasonable range
    4. No expenses assigned to future months
    5. Total per month matches Excel SUBTOTAL (warn if not)
    """
```

## Expected Behavior After Fix

### For Julho 2025:
```
Total from Excel: €8,154.80

Breakdown:
- Recurring expenses (NO DATE): €831.78
  * Manutenção Conta MEmpresa: €7.50
  * Spotify: €14.00
  * Telemovel WTF: €11.00
  * Contabilista: €123.00
  * Seg Social: €302.33
  * Pagamento Duster: €373.95
  
  These should be imported as:
  - type: "Fixo"
  - date: null/None
  - displayed in separate "Fixed Monthly Costs" section at top
  
- Dated expenses: €2,139.50
  * 01/07/2025 - Peak: €8.00
  * 02/07/2025 - IRC: €267.00
  * [etc...]
  
  These should be imported as:
  - type: "Est"
  - date: actual date
  - displayed in chronological list below fixed costs

- Casa project expenses: €5,183.52
  * These expenses ALSO exist in monthly sheet (some dated, some recurring)
  * They get TAGGED with "Casa" but are NOT double-counted
  * Example: "Jogo de Cozinha" appears in both:
    - Monthly: €16.52 (no date) ← SOURCE OF TRUTH
    - Casa: €16.95 (dated 09/07/2025) ← Just adds "Casa" tag
  * Monthly amount (€16.52) is used, tagged as "Casa"

Total in Amigo after import: €8,154.80 ✓
(NOT €9,271.19 which includes Casa duplicates!)
```

### Casa Sheet Processing Example:
```
Casa Sheet Entry:
  "Jogo de Cozinha" - €16.95 (dated 09/07/2025)

Monthly Sheet Entry:  
  "Jogo de Cozinha" - €16.52 (no date, in Julho sheet)

Import Result:
  ✓ Monthly entry is imported: €16.52
  ✓ Tagged with "Casa"
  ✓ Type: "Fixo" (because no date in monthly)
  ⚠️ User prompted: "Amount mismatch: Casa=€16.95, Monthly=€16.52"
  → User chooses option 1: Keep monthly amount
  
Final in Amigo:
  Description: "Jogo de Cozinha"
  Amount: €16.52
  Type: Fixo
  Date: None
  Tags: ["Casa"]
  Month: Julho 2025
```

### For Agosto 2025:
```
Total from Excel: €8,476.69

Should match exactly in Amigo after proper import
```

## Testing Checklist

After implementing the fix, verify:

- [ ] July 2025 total matches: €8,154.80
- [ ] August 2025 total matches: €8,476.69
- [ ] Recurring expenses appear only ONCE per month
- [ ] Recurring expenses are properly tagged (type="Fixo" or similar)
- [ ] Dated expenses have correct dates
- [ ] Casa expenses are properly categorized
- [ ] No duplicates between monthly sheets and Casa sheet
- [ ] Formulas are evaluated correctly
- [ ] Malformed dates are handled gracefully
- [ ] Import can be re-run without creating duplicates

## Code Implementation Notes

### Libraries to Use
```python
import openpyxl  # For reading Excel
from datetime import datetime, date
import re  # For parsing text dates
```

### Key Functions Needed
1. `evaluate_formula(formula_str)` - Safely evaluate Excel formulas
2. `validate_date(date_value, expected_year, expected_month)` - Validate and correct dates
3. `extract_month_year(sheet_name)` - Parse sheet names
4. `categorize_expense(description)` - Auto-categorize based on keywords
5. `detect_duplicate(expense, existing_expenses)` - Find potential duplicates
6. `import_to_amigo(expenses)` - Final import to Amigo database

### Error Handling
- Log all skipped rows with reasons
- Provide summary report after import showing:
  - Total expenses imported per month
  - Total amount per month
  - Number of duplicates detected
  - Number of errors/skipped rows
  - Comparison with Excel totals

## USER REQUIREMENTS - CRITICAL

### 1. Recurring Expenses Storage
**REQUIREMENT**: Recurring monthly expenses (those without dates in Excel) should:
- Have **NO DATE** in Amigo
- Be stored in a **SEPARATE LIST** at the top of the month view
- Be clearly distinguished from dated expenses
- Example UI: Show "Fixed Monthly Costs" section above the dated transaction list

### 2. Casa Sheet Behavior
**REQUIREMENT**: The Casa sheet is a PROJECT TRACKER, not a source of new expenses.
- Casa sheet should be a **"GHOST SHEET"** - it only contains LINKS/REFERENCES to expenses that exist in monthly sheets
- All Casa expenses should also exist in a monthly sheet (the monthly entry is the source of truth)
- Casa sheet drives the "Casa" or "Proj" tag/category in Amigo
- **Import Strategy**:
  1. Import all monthly sheets first
  2. Process Casa sheet to ADD the "Casa" tag to matching expenses
  3. If Casa entry exists but no matching monthly entry found → **PROMPT USER** with options:
     - Add missing expense to appropriate month
     - Ignore Casa entry (might be a mistake)
     - Show both and let user merge/fix
  4. If amounts differ slightly (within €1) → Flag for user review with smart suggestions

### 3. Duplicate Resolution
**REQUIREMENT**: Monthly sheet ALWAYS wins over Casa sheet.
- The monthly sheet entry is the **SOURCE OF TRUTH**
- Casa sheet entry is just a **TAG/CATEGORY MARKER**
- When matching entries found:
  - Use monthly sheet's amount
  - Use monthly sheet's description
  - Use monthly sheet's date (or no-date for recurring)
  - ADD "Casa" tag from Casa sheet
  - Log discrepancies if amounts don't match

### 4. Date Assignment for Casa Entries
**REQUIREMENT**: Casa entries should NOT have dates assigned arbitrarily.
- If Casa entry has a date in Excel → Use that date to find matching monthly entry
- If Casa entry has no date → Look at surrounding dated entries to determine which month to search
- If no match found in monthly sheets → Prompt user

## Priority Fixes

**HIGHEST PRIORITY**:
1. Separate recurring (no date) from dated expenses
2. Don't assign arbitrary dates to recurring expenses
3. Evaluate formulas in cost cells
4. Import Casa sheet correctly

**MEDIUM PRIORITY**:
5. Duplicate detection and handling
6. Validate and correct malformed dates
7. Auto-categorization

**LOWER PRIORITY**:
8. Detailed error reporting
9. Import summary statistics
