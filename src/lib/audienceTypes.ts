/**
 * audienceTypes.ts
 * ─────────────────────────────────────────────
 * Who is asking, and what each audience's sheet needs to know beyond a name,
 * an email and a phone number.
 *
 * The four audiences already have their own spreadsheets, their own columns
 * and their own people working them, so a pharmacy's request should not arrive
 * in the sheet meant for patients. Asking the type is what makes that routing
 * possible.
 *
 * This lived inside cart.tsx until the account screen needed the same list:
 * the profile stores which of these you are, and which extra fields to keep,
 * so the inquiry form can be filled in for you. Two copies of a definition
 * whose whole purpose is deciding a destination spreadsheet is exactly the
 * kind that drifts — one gains a field, the other keeps routing without it.
 */

export type FieldKey = 'position' | 'prcLicense' | 'institution' | 'location' | 'age' | 'address';

export interface TypeDef {
  value: string;
  label: string;
  /** Decides the destination spreadsheet — see INQUIRY_SPREADSHEETS. */
  inquiryType: string;
  icon: string;
  /** Patients additionally need uploads, a contact person and two consents. */
  kind?: 'patient' | 'partner';
  /** Extra columns this audience's sheet has beyond name/email/phone/message. */
  fields: Array<{ key: FieldKey; label: string; required?: boolean }>;
}

export const USER_TYPES: TypeDef[] = [
  {
    // Deliberately NOT Product Inquiry. On the website a patient's product
    // inquiry is routed to the Order Medicine sheet, because a patient supplies
    // the same things an order does — prescription, valid ID, age, delivery
    // address, contact person — and that sheet has the columns for them. Sending
    // the app's patients somewhere else would split one funnel across two sheets.
    value: 'patient',
    label: 'Patient / Caregiver',
    inquiryType: 'Order Medicine',
    icon: 'fa-user',
    kind: 'patient',
    fields: [
      { key: 'age', label: 'Age', required: true },
      { key: 'address', label: 'Delivery address', required: true },
    ],
  },
  {
    value: 'doctor',
    label: 'Doctor / Healthcare Professional',
    inquiryType: 'Doctor Inquiry',
    icon: 'fa-user-doctor',
    fields: [
      { key: 'position', label: 'Specialty / field of practice', required: true },
      { key: 'prcLicense', label: 'PRC license number', required: true },
      { key: 'institution', label: 'Hospital / clinic affiliation' },
      { key: 'location', label: 'City' },
    ],
  },
  {
    value: 'pharmacy',
    label: 'Pharmacy Owner / Retail Pharmacy',
    inquiryType: 'Pharmacy Inquiry',
    icon: 'fa-mortar-pestle',
    fields: [
      { key: 'position', label: 'Position / role', required: true },
      { key: 'institution', label: 'Pharmacy / business name', required: true },
      { key: 'location', label: 'City' },
    ],
  },
  {
    value: 'hospital',
    label: 'Hospital / Institution',
    inquiryType: 'Hospital Inquiry',
    icon: 'fa-hospital',
    fields: [
      { key: 'position', label: 'Position / role', required: true },
      { key: 'institution', label: 'Hospital / institution name', required: true },
      { key: 'location', label: 'City' },
    ],
  },
];

export const typeByValue = (value?: string): TypeDef | undefined =>
  USER_TYPES.find((t) => t.value === value);
