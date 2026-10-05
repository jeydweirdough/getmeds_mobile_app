'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/api';
import { submitInquiry } from '@/lib/offlineInquiry';
import { loadDetails } from '@/lib/accountStore';
import { Turnstile, useTurnstile, TURNSTILE_SITE_KEY } from '@/lib/turnstile';
import {
  BadgeCheck, Factory, FileCheck, Truck, Headset, Gavel, Siren,
  Boxes, Tags, CreditCard, PackageCheck, ClipboardCheck, UserRoundCheck, ListChecks,
  Stethoscope, HeartPulse, TriangleAlert,
} from 'lucide-react';

// intl-tel-input + window.gcbPhone were loaded by order-medicines.html; in
// Next.js lib/gcbPhone.ts defines the same helper and loads the CDN on demand.
// window.turnstile is declared (and its script loaded) by lib/turnstile.tsx.
import { loadGcbPhone } from '@/lib/gcbPhone';
import './order-medicines.css';
import { validateFiles, ALLOWED_FILE_TYPES_ACCEPT } from '@/lib/fileUpload';
import AlertModal from '@/lib/AlertModal';
import { ORDER_AUDIENCES, ORDER_MEDICINES_BASE, audienceBySlug, audiencePath } from '@/lib/orderAudiences';
import OrderMedicinesHub from '@/lib/OrderMedicinesHub';
import { useLang } from '@/lib/i18n';


// `audienceSlug` comes from the [audience] route segment (undefined on the hub
// at /order-medicines), so server and client agree on which page this is.
export default function OrderMedicinesClient({ audienceSlug }: { audienceSlug?: string } = {}) {
  const { tr } = useLang();
  // No setPageMeta here. This is a multi-page app with no client-side router, so
  // this URL never changes while the page is open — the title, description and OG
  // tags served in order-medicines.html are already the final ones. Re-setting them on mount
  // only created a second copy to disagree with, which is what Audit 4 found.

  const [currentSlide, setCurrentSlide] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const slideIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalSlides = 3;

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [phoneCountryOpen, setPhoneCountryOpen] = useState(false);
  const [ageDropdownOpen, setAgeDropdownOpen] = useState(false);
  const ageDropdownRef = useRef<HTMLDivElement>(null);
  const [phoneCountry, setPhoneCountry] = useState({ code: '+63', flag: '🇵🇭', name: 'Philippines', mask: '### ### ####' });
  const [phoneSearch, setPhoneSearch] = useState('');

  const PHONE_COUNTRIES = [
    { code: '+63', flag: '🇵🇭', name: 'Philippines', mask: '### ### ####' },
    { code: '+61', flag: '🇦🇺', name: 'Australia', mask: '### ### ###' },
    { code: '+880', flag: '🇧🇩', name: 'Bangladesh', mask: '####-######' },
    { code: '+855', flag: '🇰🇭', name: 'Cambodia', mask: '## ### ###' },
    { code: '+86', flag: '🇨🇳', name: 'China', mask: '### #### ####' },
    { code: '+852', flag: '🇭🇰', name: 'Hong Kong', mask: '#### ####' },
    { code: '+91', flag: '🇮🇳', name: 'India', mask: '##### #####' },
    { code: '+62', flag: '🇮🇩', name: 'Indonesia', mask: '###-####-####' },
    { code: '+81', flag: '🇯🇵', name: 'Japan', mask: '##-####-####' },
    { code: '+82', flag: '🇰🇷', name: 'South Korea', mask: '##-####-####' },
    { code: '+856', flag: '🇱🇦', name: 'Laos', mask: '## ### ###' },
    { code: '+60', flag: '🇲🇾', name: 'Malaysia', mask: '##-#### ####' },
    { code: '+960', flag: '🇲🇻', name: 'Maldives', mask: '###-####' },
    { code: '+976', flag: '🇲🇳', name: 'Mongolia', mask: '#### ####' },
    { code: '+95', flag: '🇲🇲', name: 'Myanmar', mask: '## ### ####' },
    { code: '+977', flag: '🇳🇵', name: 'Nepal', mask: '##-###-####' },
    { code: '+64', flag: '🇳🇿', name: 'New Zealand', mask: '### ### ####' },
    { code: '+92', flag: '🇵🇰', name: 'Pakistan', mask: '###-#######' },
    { code: '+65', flag: '🇸🇬', name: 'Singapore', mask: '#### ####' },
    { code: '+94', flag: '🇱🇰', name: 'Sri Lanka', mask: '## ### ####' },
    { code: '+886', flag: '🇹🇼', name: 'Taiwan', mask: '#### ######' },
    { code: '+66', flag: '🇹🇭', name: 'Thailand', mask: '##-####-####' },
    { code: '+84', flag: '🇻🇳', name: 'Vietnam', mask: '### ### ####' },
    { code: '+973', flag: '🇧🇭', name: 'Bahrain', mask: '#### ####' },
    { code: '+964', flag: '🇮🇶', name: 'Iraq', mask: '### ### ####' },
    { code: '+972', flag: '🇮🇱', name: 'Israel', mask: '##-###-####' },
    { code: '+962', flag: '🇯🇴', name: 'Jordan', mask: '## #### ####' },
    { code: '+965', flag: '🇰🇼', name: 'Kuwait', mask: '#### ####' },
    { code: '+961', flag: '🇱🇧', name: 'Lebanon', mask: '## ### ###' },
    { code: '+968', flag: '🇴🇲', name: 'Oman', mask: '#### ####' },
    { code: '+974', flag: '🇶🇦', name: 'Qatar', mask: '#### ####' },
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', mask: '## ### ####' },
    { code: '+90', flag: '🇹🇷', name: 'Turkey', mask: '### ### ####' },
    { code: '+971', flag: '🇦🇪', name: 'UAE', mask: '## ### ####' },
    { code: '+967', flag: '🇾🇪', name: 'Yemen', mask: '### ### ###' },
    { code: '+355', flag: '🇦🇱', name: 'Albania', mask: '## ### ####' },
    { code: '+43', flag: '🇦🇹', name: 'Austria', mask: '### #######' },
    { code: '+32', flag: '🇧🇪', name: 'Belgium', mask: '### ## ## ##' },
    { code: '+387', flag: '🇧🇦', name: 'Bosnia', mask: '## ###-###' },
    { code: '+359', flag: '🇧🇬', name: 'Bulgaria', mask: '## ### ####' },
    { code: '+385', flag: '🇭🇷', name: 'Croatia', mask: '## ### ####' },
    { code: '+357', flag: '🇨🇾', name: 'Cyprus', mask: '## ######' },
    { code: '+420', flag: '🇨🇿', name: 'Czech Republic', mask: '### ### ###' },
    { code: '+45', flag: '🇩🇰', name: 'Denmark', mask: '## ## ## ##' },
    { code: '+372', flag: '🇪🇪', name: 'Estonia', mask: '#### ####' },
    { code: '+358', flag: '🇫🇮', name: 'Finland', mask: '## ### ####' },
    { code: '+33', flag: '🇫🇷', name: 'France', mask: '## ## ## ## ##' },
    { code: '+49', flag: '🇩🇪', name: 'Germany', mask: '#### #######' },
    { code: '+30', flag: '🇬🇷', name: 'Greece', mask: '### ### ####' },
    { code: '+36', flag: '🇭🇺', name: 'Hungary', mask: '## ### ####' },
    { code: '+354', flag: '🇮🇸', name: 'Iceland', mask: '### ####' },
    { code: '+353', flag: '🇮🇪', name: 'Ireland', mask: '## ### ####' },
    { code: '+39', flag: '🇮🇹', name: 'Italy', mask: '### ### ####' },
    { code: '+371', flag: '🇱🇻', name: 'Latvia', mask: '## ### ###' },
    { code: '+370', flag: '🇱🇹', name: 'Lithuania', mask: '### #####' },
    { code: '+352', flag: '🇱🇺', name: 'Luxembourg', mask: '### ### ###' },
    { code: '+356', flag: '🇲🇹', name: 'Malta', mask: '#### ####' },
    { code: '+31', flag: '🇳🇱', name: 'Netherlands', mask: '## ### ####' },
    { code: '+47', flag: '🇳🇴', name: 'Norway', mask: '### ## ###' },
    { code: '+48', flag: '🇵🇱', name: 'Poland', mask: '### ### ###' },
    { code: '+351', flag: '🇵🇹', name: 'Portugal', mask: '### ### ###' },
    { code: '+40', flag: '🇷🇴', name: 'Romania', mask: '### ### ###' },
    { code: '+7', flag: '🇷🇺', name: 'Russia', mask: '### ###-##-##' },
    { code: '+381', flag: '🇷🇸', name: 'Serbia', mask: '## ### ####' },
    { code: '+421', flag: '🇸🇰', name: 'Slovakia', mask: '### ### ###' },
    { code: '+386', flag: '🇸🇮', name: 'Slovenia', mask: '## ### ###' },
    { code: '+34', flag: '🇪🇸', name: 'Spain', mask: '### ### ###' },
    { code: '+46', flag: '🇸🇪', name: 'Sweden', mask: '##-### ## ##' },
    { code: '+41', flag: '🇨🇭', name: 'Switzerland', mask: '## ### ## ##' },
    { code: '+380', flag: '🇺🇦', name: 'Ukraine', mask: '## ### ## ##' },
    { code: '+44', flag: '🇬🇧', name: 'United Kingdom', mask: '#### ######' },
    { code: '+1', flag: '🇺🇸', name: 'USA / Canada', mask: '(###) ###-####' },
    { code: '+54', flag: '🇦🇷', name: 'Argentina', mask: '## ####-####' },
    { code: '+591', flag: '🇧🇴', name: 'Bolivia', mask: '#### ####' },
    { code: '+55', flag: '🇧🇷', name: 'Brazil', mask: '(##) #####-####' },
    { code: '+56', flag: '🇨🇱', name: 'Chile', mask: '## #### ####' },
    { code: '+57', flag: '🇨🇴', name: 'Colombia', mask: '### ### ####' },
    { code: '+506', flag: '🇨🇷', name: 'Costa Rica', mask: '#### ####' },
    { code: '+53', flag: '🇨🇺', name: 'Cuba', mask: '## ###-####' },
    { code: '+593', flag: '🇪🇨', name: 'Ecuador', mask: '## ### ####' },
    { code: '+503', flag: '🇸🇻', name: 'El Salvador', mask: '#### ####' },
    { code: '+502', flag: '🇬🇹', name: 'Guatemala', mask: '#### ####' },
    { code: '+504', flag: '🇭🇳', name: 'Honduras', mask: '#### ####' },
    { code: '+52', flag: '🇲🇽', name: 'Mexico', mask: '## #### ####' },
    { code: '+505', flag: '🇳🇮', name: 'Nicaragua', mask: '#### ####' },
    { code: '+507', flag: '🇵🇦', name: 'Panama', mask: '#### ####' },
    { code: '+595', flag: '🇵🇾', name: 'Paraguay', mask: '### ### ###' },
    { code: '+51', flag: '🇵🇪', name: 'Peru', mask: '### ### ###' },
    { code: '+1787', flag: '🇵🇷', name: 'Puerto Rico', mask: '###-####' },
    { code: '+598', flag: '🇺🇾', name: 'Uruguay', mask: '## ### ####' },
    { code: '+58', flag: '🇻🇪', name: 'Venezuela', mask: '###-#######' },
    { code: '+213', flag: '🇩🇿', name: 'Algeria', mask: '### ## ## ##' },
    { code: '+244', flag: '🇦🇴', name: 'Angola', mask: '### ### ###' },
    { code: '+229', flag: '🇧🇯', name: 'Benin', mask: '## ## ## ##' },
    { code: '+267', flag: '🇧🇼', name: 'Botswana', mask: '## ### ###' },
    { code: '+226', flag: '🇧🇫', name: 'Burkina Faso', mask: '## ## ## ##' },
    { code: '+237', flag: '🇨🇲', name: 'Cameroon', mask: '#### ####' },
    { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire", mask: '## ## ## ##' },
    { code: '+20', flag: '🇪🇬', name: 'Egypt', mask: '### ### ####' },
    { code: '+251', flag: '🇪🇹', name: 'Ethiopia', mask: '## ### ####' },
    { code: '+233', flag: '🇬🇭', name: 'Ghana', mask: '## ### ####' },
    { code: '+254', flag: '🇰🇪', name: 'Kenya', mask: '### ######' },
    { code: '+261', flag: '🇲🇬', name: 'Madagascar', mask: '## ## ### ##' },
    { code: '+265', flag: '🇲🇼', name: 'Malawi', mask: '#### ####' },
    { code: '+223', flag: '🇲🇱', name: 'Mali', mask: '## ## ## ##' },
    { code: '+212', flag: '🇲🇦', name: 'Morocco', mask: '###-######' },
    { code: '+258', flag: '🇲🇿', name: 'Mozambique', mask: '## ### ####' },
    { code: '+264', flag: '🇳🇦', name: 'Namibia', mask: '## ### ####' },
    { code: '+234', flag: '🇳🇬', name: 'Nigeria', mask: '### ### ####' },
    { code: '+250', flag: '🇷🇼', name: 'Rwanda', mask: '### ### ###' },
    { code: '+221', flag: '🇸🇳', name: 'Senegal', mask: '## ### ## ##' },
    { code: '+27', flag: '🇿🇦', name: 'South Africa', mask: '## ### ####' },
    { code: '+249', flag: '🇸🇩', name: 'Sudan', mask: '## ### ####' },
    { code: '+255', flag: '🇹🇿', name: 'Tanzania', mask: '### ### ###' },
    { code: '+216', flag: '🇹🇳', name: 'Tunisia', mask: '## ### ###' },
    { code: '+256', flag: '🇺🇬', name: 'Uganda', mask: '### ######' },
    { code: '+260', flag: '🇿🇲', name: 'Zambia', mask: '## #######' },
    { code: '+263', flag: '🇿🇼', name: 'Zimbabwe', mask: '## ### ####' },
  ];

  const applyMask = (raw: string, mask: string) => {
    const digits = raw.replace(/\D/g, '');
    let result = '';
    let di = 0;
    for (let i = 0; i < mask.length && di < digits.length; i++) {
      if (mask[i] === '#') { result += digits[di++]; }
      else { result += mask[i]; }
    }
    return result;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cursorPos = e.target.selectionStart ?? raw.length;
    const digitsBeforeCursor = raw.slice(0, cursorPos).replace(/\D/g, '').length;
    const formatted = applyMask(raw, phoneCountry.mask);
    setFormData(prev => ({ ...prev, phone: formatted }));
    requestAnimationFrame(() => {
      const el = phoneInputRef.current;
      if (!el) return;
      let count = 0;
      let newPos = formatted.length;
      if (digitsBeforeCursor === 0) {
        newPos = 0;
      } else {
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            count++;
            if (count === digitsBeforeCursor) { newPos = i + 1; break; }
          }
        }
      }
      el.setSelectionRange(newPos, newPos);
    });
  };

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [viewingFileUrl, setViewingFileUrl] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [validationSubmitted, setValidationSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    patientName: '',
    email: '',
    phone: '',
    age: '',
    dob: '',
    address: '',
    contactName: '',
    contactRelationship: '',
    terms: false,
    privacyConsent: false
  });
  /**
   * Autofill from the account, matching the request list.
   *
   * Fills only fields that are still empty and runs exactly once, so it can
   * never overwrite something half-typed and a value the visitor has
   * deliberately cleared does not reappear underneath them. The field names
   * differ from the stored ones here — this form calls it patientName — which
   * is why the mapping is spelled out rather than spread.
   */
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    loadDetails().then((d) => {
      if (!d) return;
      setFormData((f) => ({
        ...f,
        patientName: f.patientName || d.name || '',
        email: f.email || d.email || '',
        phone: f.phone || d.phone || '',
        age: f.age || d.age || '',
        address: f.address || d.address || '',
        contactName: f.contactName || d.contactName || '',
        contactRelationship: f.contactRelationship || d.contactRelationship || '',
      }));
    });
  }, []);

  const [patientIdFile, setPatientIdFile] = useState<File | null>(null);
  const [contactSameAsPatient, setContactSameAsPatient] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title?: string; message: string | string[] } | null>(null);
  const showAlert = (message: string | string[], title?: string) => setAlertModal({ title, message });

  const handlePatientIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const { valid, errors } = validateFiles([e.target.files[0]]);
      if (errors.length > 0) showAlert(errors, tr('Invalid File', 'Hindi valid ang file'));
      if (valid.length > 0) setPatientIdFile(valid[0]);
      e.target.value = '';
    }
  };
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successKind, setSuccessKind] = useState<'order' | 'inquiry'>('order');
  const [idRequiredModalOpen, setIdRequiredModalOpen] = useState(false);
  const [idModalVisible, setIdModalVisible] = useState(false);

  // ── Audience gate — the URL decides which page this is. /order-medicines is the
  // hub (four cards, one per audience); /order-medicines/patients renders the
  // prescription order form, and /doctors, /distributors and /hospitals render the
  // professional and partner forms (mirrors the non-patient branch on
  // product-detail.tsx).
  //
  // This used to be read from localStorage, written by whichever link the visitor
  // came through. That meant four different pages shared one URL, one title and one
  // canonical, and a visitor who arrived without the key — a search result, a shared
  // link, a cleared browser — was shown the patient form and asked who they were.
  // The path is read once on mount: this is a multi-page app with no client-side
  // router, so it cannot change while the page is open.
  const audience = audienceSlug ? audienceBySlug(audienceSlug) : undefined;
  const isHub = !audience;
  const orderUserType = audience ? audience.type : '';
  // Labels keyed by internal type, as the forms and stored records still expect.
  const USER_TYPE_LABELS: Record<string, string> = Object.fromEntries(
    ORDER_AUDIENCES.map((a) => [a.type, a.label]),
  );
  const USER_TYPE_DISPLAY_LABELS: Record<string, string> = Object.fromEntries(
    ORDER_AUDIENCES.map((a) => [a.type, tr(a.label, a.labelTl ?? a.label)]),
  );
  // Where an inquiry queued offline sends the visitor back to finish it by hand.
  // That has to be the audience page the form is on — the hub carries no form.
  const formReturnPath = audience ? audiencePath(audience) : ORDER_MEDICINES_BASE;
  const isProfessionalUserType = orderUserType === 'doctor' || orderUserType === 'hospital' || orderUserType === 'pharmacy';
  const isHospitalUserType = orderUserType === 'hospital';
  const isPharmacyUserType = orderUserType === 'pharmacy';
  const isDoctorUserType = orderUserType === 'doctor';
  // Hospitals and pharmacy owners both go through the B2B partner flow: same eight
  // form fields, same phone/challenge handling, their own spreadsheet each. Doctors
  // stay on the shorter generic professional form.
  const isPartnerUserType = isHospitalUserType || isPharmacyUserType || isDoctorUserType;

  // Hero copy depends on who is ordering. Hospitals and institutions buy through a
  // procurement process rather than a general "inquiry", so they lead with who the
  // page is for and carry an extra tagline line; doctors and pharmacy owners keep
  // the shared professional copy, and everyone else sees the patient flow.
  const heroCopy = isDoctorUserType
    ? {
        title: tr('For Doctors & Healthcare Professionals', 'Para sa mga Doktor at Healthcare Professional'),
        tagline: tr('Product Access & Support for Your Practice', 'Access sa Produkto at Suporta para sa Inyong Practice'),
        subtitle: tr('Product orders, medical and product information, sample requests, Compassionate Special Permit (CSP) coordination, and clinical documentation \u2014 for physicians, specialists, and healthcare professionals across the Philippines.', 'Product orders, impormasyong medikal at tungkol sa produkto, sample request, koordinasyon ng Compassionate Special Permit (CSP), at clinical documentation \u2014 para sa mga physician, specialist at healthcare professional sa buong Pilipinas.'),
      }
    : isPharmacyUserType
    ? {
        title: tr('For Pharmacy Owners & Retail Pharmacies', 'Para sa mga May-ari ng Botika at Retail Pharmacy'),
        tagline: tr('Your Reliable Pharmaceutical Distributor Partner', 'Ang Maaasahan Ninyong Pharmaceutical Distributor Partner'),
        subtitle: tr('Wholesale pricing, distributor account setup, bulk order fulfillment, and ongoing supply support \u2014 for independent pharmacies, drugstores, and pharmacy chains across the Philippines. As an FDA Philippines-licensed wholesaler, importer, and distributor, Getmeds serves as a dedicated B2B supply partner for pharmacies.', 'Wholesale na presyo, pag-setup ng distributor account, bulk order fulfillment, at tuloy-tuloy na supply support \u2014 para sa mga independent pharmacy, drugstore at pharmacy chain sa buong Pilipinas. Bilang wholesaler, importer at distributor na lisensyado ng FDA Philippines, ang Getmeds ay nakatutok na B2B supply partner ng mga botika.'),
      }
    : isHospitalUserType
    ? {
        title: tr('For Hospitals & Healthcare Institutions', 'Para sa mga Ospital at Healthcare Institution'),
        tagline: tr('Hospital Procurement, Handled with Care', 'Hospital Procurement, Inaasikaso nang Maingat'),
        subtitle: tr('Product quotations, hospital procurement, emergency purchase requirements, pharmaceutical product availability, institutional orders, and dedicated account support — for hospitals and healthcare institutions across the Philippines.', 'Product quotation, hospital procurement, emergency na pagbili, availability ng mga pharmaceutical product, institutional order, at dedicated na account support — para sa mga ospital at healthcare institution sa buong Pilipinas.'),
      }
    : isProfessionalUserType
      ? {
          title: tr('Professional & Partner Inquiries', 'Inquiry ng mga Professional at Partner'),
          tagline: '',
          subtitle: tr('Send us your requirements and our team will follow up with a formal response.', 'Ipadala ang inyong mga kailangan at magfo-follow up ang aming team ng pormal na sagot.'),
        }
      : {
          title: tr('How to order with prescription', 'Paano mag-order gamit ang reseta'),
          tagline: '',
          subtitle: tr('A simple 3-step process designed for your convenience.', 'Isang simpleng 3-step na proseso para sa inyong kaginhawaan.'),
        };

  // The "Who's placing this order?" modal that used to guard these upload controls
  // is gone: the prescription form only renders at /order-medicines/patients, so the
  // audience is already known by the time either control can be clicked. Visitors
  // who have not chosen yet land on the hub instead and pick from the four cards.

  // ── Generic professional inquiry form (Doctor/Hospital/Pharmacy Owner) ──
  const [inquiryFormData, setInquiryFormData] = useState({ name: '', phone: '', email: '', message: '', age: '' });
  const [inquirySubmitState, setInquirySubmitState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [inquiryAgeDropdownOpen, setInquiryAgeDropdownOpen] = useState(false);
  const inquiryAgeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inquiryAgeDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (inquiryAgeDropdownRef.current && !inquiryAgeDropdownRef.current.contains(e.target as Node)) {
        setInquiryAgeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [inquiryAgeDropdownOpen]);

  // The endpoint answers 200 whenever the inquiry was accepted, even if the
  // Google Sheet row never landed (an inquiryType the backend has no spreadsheet
  // mapped for, or a failed append). Emailing still happened, so the visitor is
  // right to see the success modal - but a lead missing from the sheet it is
  // worked from is an outage for the team, and a 200 alone hides it.
  const warnIfRowLost = (result: any, formLabel: string) => {
    if (result && result.success && result.sheets_appended === false) {
      console.error(
        `[getmeds] ${formLabel} was accepted but NOT written to its Google Sheet.`,
        result.sheets_error || 'No reason reported by the server.'
      );
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInquirySubmitState('sending');
    try {
      const payload = {
        inquiryType: 'Product Inquiry',
        turnstileToken: inquiryTurnstile.token,
        fullName: inquiryFormData.name,
        email: inquiryFormData.email,
        phone: inquiryFormData.phone,
        message: inquiryFormData.message,
        additionalData: {
          age: inquiryFormData.age,
          customerType: USER_TYPE_LABELS[orderUserType] || orderUserType,
        },
        files: []
      };

      const submission = await submitInquiry(payload, {
        endpoint: getApiUrl(),
        returnPath: formReturnPath,
      });
      // Tokens are single-use, so the solved widget is replaced whatever the outcome.
      inquiryTurnstile.reset();
      // A queued inquiry is not a delivered one, so only a real send
      // opens the success modal; QueuedInquiryNotice reports the rest.
      if (submission.status === 'failed') throw new Error(submission.error);
      warnIfRowLost(submission.status === 'sent' ? submission.body : null, 'Professional inquiry');

      setInquirySubmitState('sent');
      setInquiryFormData({ name: '', phone: '', email: '', message: '', age: '' });
      setSuccessKind('inquiry');
      submission.status === 'sent' && setSuccessModalOpen(true);
      setTimeout(() => setInquirySubmitState('idle'), 300);
    } catch (error) {
      console.error('Inquiry submission error:', error);
      setInquirySubmitState('error');
      setTimeout(() => setInquirySubmitState('idle'), 2000);
    }
  };

  // ── Hospital / institution procurement inquiry ──
  // Routed under its own inquiryType so it lands in its own Google Sheet: the backend
  // resolves the destination spreadsheet by inquiryType (see inquiry.py), so this
  // string must match the "Inquiry Type" set on the googleSpreadsheet / inquiryRouting
  // document in Sanity Studio. Changing it here without changing it there silently
  // drops submissions from the sheet.
  const HOSPITAL_INQUIRY_TYPE = 'Hospital Inquiry';
  const PHARMACY_INQUIRY_TYPE = 'Pharmacy Inquiry';
  const DOCTOR_INQUIRY_TYPE = 'Doctor Inquiry';
  const PARTNER_INQUIRY_TYPE = isDoctorUserType
    ? DOCTOR_INQUIRY_TYPE
    : isPharmacyUserType ? PHARMACY_INQUIRY_TYPE : HOSPITAL_INQUIRY_TYPE;

  // Everything that differs between the two partner forms. The markup below is shared.
  const PARTNER_FORM = isDoctorUserType
    ? {
        badgeIcon: 'fa-user-doctor',
        badgeLabel: USER_TYPE_DISPLAY_LABELS.doctor,
        heading: tr('Send an Inquiry', 'Magpadala ng Inquiry'),
        subtitle: tr('Submit your request and our team will follow up with product availability, pricing, documentation, or order coordination.', 'Ipadala ang inyong request at magfo-follow up ang aming team tungkol sa availability ng produkto, presyo, dokumentasyon o koordinasyon ng order.'),
        namePlaceholder: tr('e.g., Dr. Maria Santos', 'hal., Dr. Maria Santos'),
        positionLabel: tr('Specialty / Field of Practice', 'Specialty / Larangan ng Practice'),
        positionPlaceholder: tr('e.g., Oncology, Internal Medicine, Anesthesiology', 'hal., Oncology, Internal Medicine, Anesthesiology'),
        showPrcLicense: true,
        prcPlaceholder: tr('e.g., 0000000', 'hal., 0000000'),
        orgLabel: tr('Hospital / Clinic Affiliation', 'Ospital / Klinikang Kaanib'),
        orgPlaceholder: tr('e.g., Makati Medical Center', 'hal., Makati Medical Center'),
        locationPlaceholder: tr('e.g., Makati City, Metro Manila', 'hal., Makati City, Metro Manila'),
        emailLabel: tr('Professional Email', 'Professional Email'),
        emailPlaceholder: tr('e.g., dr.santos@hospital.com', 'hal., dr.santos@hospital.com'),
        messagePlaceholder: tr("Tell us the product, molecule, or patient/institutional requirement you're inquiring about.", 'Sabihin sa amin ang produkto, molecule, o pangangailangan ng pasyente/institusyon na inyong itinatanong.'),
        consent: tr('I confirm that I am a licensed healthcare professional submitting this inquiry in a professional capacity, and I consent to Getmeds collecting, using, and storing the information provided in this form to respond to my inquiry.', 'Kinukumpirma kong ako ay lisensyadong healthcare professional na nagpapadala ng inquiry na ito bilang propesyonal, at pumapayag akong kolektahin, gamitin at itago ng Getmeds ang impormasyon sa form na ito para sagutin ang aking inquiry.'),
        helpHeading: tr('Contact Our Team', 'Makipag-ugnayan sa Aming Team'),
        helpBlurb: tr('For urgent orders or medical inquiries, reach out directly.', 'Para sa urgent na order o medical inquiry, direktang makipag-ugnayan sa amin.'),
        contacts: [
          { icon: 'fa-phone', label: '+63 917 166 5029', href: 'tel:+639171665029' },
          { icon: 'fa-phone', label: '+63 917 581 4029', href: 'tel:+639175814029' },
          { icon: 'fa-envelope', label: 'sales9@getmeds.ph', href: 'mailto:sales9@getmeds.ph' },
          { icon: 'fa-envelope', label: 'care20@getmeds.ph', href: 'mailto:care20@getmeds.ph' },
        ],
      }
    : isPharmacyUserType
    ? {
        badgeIcon: 'fa-store',
        badgeLabel: USER_TYPE_DISPLAY_LABELS.pharmacy,
        heading: tr('Become a Getmeds Partner Distributor', 'Maging Partner Distributor ng Getmeds'),
        subtitle: tr("Submit your pharmacy's details and our distributor team will follow up with product catalogs, pricing, and account setup.", 'Ipadala ang detalye ng inyong botika at magfo-follow up ang aming distributor team ng product catalog, presyo at account setup.'),
        namePlaceholder: tr('e.g., Juan Dela Cruz', 'hal., Juan Dela Cruz'),
        positionLabel: tr('Position / Role', 'Posisyon / Tungkulin'),
        positionPlaceholder: tr('e.g., Pharmacy Owner, Pharmacist-in-Charge, Purchasing Manager', 'hal., Pharmacy Owner, Pharmacist-in-Charge, Purchasing Manager'),
        showPrcLicense: false,
        prcPlaceholder: '',
        emailLabel: tr('Business Email', 'Business Email'),
        orgLabel: tr('Pharmacy / Business Name', 'Pangalan ng Botika / Negosyo'),
        orgPlaceholder: tr('e.g., Dela Cruz Drugstore', 'hal., Dela Cruz Drugstore'),
        locationPlaceholder: tr('e.g., Cebu City, Cebu', 'hal., Cebu City, Cebu'),
        emailPlaceholder: tr('e.g., owner@drugstore.com', 'hal., owner@drugstore.com'),
        messagePlaceholder: tr("Tell us what products, brands, or categories you're looking to source.", 'Sabihin sa amin kung anong mga produkto, brand o kategorya ang gusto ninyong i-source.'),
        consent: tr('I confirm that I am authorized to submit this inquiry on behalf of the pharmacy or business named above, and I consent to Getmeds collecting, using, and storing the information provided in this form to respond to my inquiry.', 'Kinukumpirma kong awtorisado akong magpadala ng inquiry na ito para sa botika o negosyong nakapangalan sa itaas, at pumapayag akong kolektahin, gamitin at itago ng Getmeds ang impormasyon sa form na ito para sagutin ang aking inquiry.'),
        helpHeading: tr('Need Help Setting Up Your Distributor Account?', 'Kailangan ng Tulong sa Pag-setup ng Distributor Account?'),
        helpBlurb: tr('For onboarding assistance, credit terms, or product catalog requests, contact our Pharmacy Partnerships Team directly.', 'Para sa tulong sa onboarding, credit terms o request ng product catalog, direktang makipag-ugnayan sa aming Pharmacy Partnerships Team.'),
        contacts: [
          { icon: 'fa-phone', label: '+63 908 866 7139', href: 'tel:+639088667139' },
          { icon: 'fa-phone', label: '+63 993 373 9842', href: 'tel:+639933739842' },
          { icon: 'fa-envelope', label: 'sales5@2mginc.com', href: 'mailto:sales5@2mginc.com' },
          { icon: 'fa-envelope', label: 'sales22@getmeds.ph', href: 'mailto:sales22@getmeds.ph' },
        ],
      }
    : {
        badgeIcon: 'fa-hospital',
        badgeLabel: USER_TYPE_DISPLAY_LABELS.hospital,
        heading: tr('Send an Inquiry', 'Magpadala ng Inquiry'),
        subtitle: tr("Submit your hospital's requirements and our team will follow up with formal documentation, quotations, and coordination.", 'Ipadala ang mga kailangan ng inyong ospital at magfo-follow up ang aming team ng pormal na dokumentasyon, quotation at koordinasyon.'),
        namePlaceholder: tr('e.g., Dr. Juan Dela Cruz', 'hal., Dr. Juan Dela Cruz'),
        positionLabel: tr('Position / Role', 'Posisyon / Tungkulin'),
        positionPlaceholder: tr('e.g., Chief of Pharmacy, Procurement Officer', 'hal., Chief of Pharmacy, Procurement Officer'),
        showPrcLicense: false,
        prcPlaceholder: '',
        emailLabel: tr('Business Email', 'Business Email'),
        orgLabel: tr('Hospital / Institution Name', 'Pangalan ng Ospital / Institusyon'),
        orgPlaceholder: tr('e.g., Philippine General Hospital', 'hal., Philippine General Hospital'),
        locationPlaceholder: tr('e.g., Quezon City, Metro Manila', 'hal., Quezon City, Metro Manila'),
        emailPlaceholder: tr('e.g., procurement@hospital.gov.ph', 'hal., procurement@hospital.gov.ph'),
        messagePlaceholder: tr('Tell us more about your requirements...', 'Sabihin sa amin ang higit pa tungkol sa inyong mga kailangan...'),
        consent: tr('I confirm that I am authorized to submit this inquiry on behalf of the hospital or healthcare institution named above, and I consent to Getmeds collecting, using, and storing the information provided in this form to respond to my inquiry.', 'Kinukumpirma kong awtorisado akong magpadala ng inquiry na ito para sa ospital o healthcare institution na nakapangalan sa itaas, at pumapayag akong kolektahin, gamitin at itago ng Getmeds ang impormasyon sa form na ito para sagutin ang aking inquiry.'),
        helpHeading: tr('Need Urgent Hospital Assistance?', 'Kailangan ng Urgent na Tulong para sa Ospital?'),
        helpBlurb: tr('For emergency purchases and critical-care orders, contact our Hospital Sales Team directly for immediate coordination.', 'Para sa emergency na pagbili at critical-care order, direktang makipag-ugnayan sa aming Hospital Sales Team para sa agarang koordinasyon.'),
        contacts: [
          { icon: 'fa-phone', label: '+63 999 889 0592', href: 'tel:+639998890592' },
          { icon: 'fa-phone', label: '+63 917 155 7029', href: 'tel:+639171557029' },
          { icon: 'fa-envelope', label: 'sales3@getmeds.ph', href: 'mailto:sales3@getmeds.ph' },
          { icon: 'fa-envelope', label: 'sales24@getmeds.ph', href: 'mailto:sales24@getmeds.ph' },
        ],
      };

  const emptyPartnerForm = {
    name: '', position: '', institution: '', location: '',
    email: '', message: '', consent: false,
    prcLicense: '',   // doctors only; ignored by the other partner types
  };
  const [partnerFormData, setPartnerFormData] = useState(emptyPartnerForm);
  const [partnerSubmitState, setPartnerSubmitState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [partnerPhoneError, setPartnerPhoneError] = useState('');

  // The phone input is deliberately UNCONTROLLED: intl-tel-input rewrites
  // input.value directly (digit stripping, max-length trimming), which fights a
  // React-controlled value. The submitted number is read from the widget instead.
  const partnerPhoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPartnerUserType) return;
    const input = partnerPhoneRef.current;
    if (!input) return;
    let cancelled = false;
    loadGcbPhone().then(() => { if (!cancelled) window.gcbPhone?.init(input); });
    return () => { cancelled = true; window.gcbPhone?.destroy(input); };
  }, [isPartnerUserType]);

  // ── Cloudflare Turnstile ──
  // One handle per form, each gated on that form's own visibility so a widget is
  // mounted only for the form actually on screen and remounts when the visitor
  // switches user type. This page previously held the site's only implementation,
  // and it covered the partner form alone — which is why every other form on
  // getmeds.ph submitted an empty token. The shared hook now lives in
  // lib/turnstile.tsx so a new form cannot quietly ship without one.
  // `!isHub` guards the first one: the hub carries no form, and without it the
  // patient widget would mount there purely because the audience is not a professional.
  const orderTurnstile = useTurnstile(!isHub && !isProfessionalUserType);
  const inquiryTurnstile = useTurnstile(isProfessionalUserType && !isPartnerUserType);
  const partnerTurnstile = useTurnstile(isPartnerUserType);

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Submit the E.164 form ("+639171234567"), never the raw national digits the
    // visitor sees in the box.
    const phoneInput = partnerPhoneRef.current;
    if (!window.gcbPhone?.isEmpty(phoneInput) && !window.gcbPhone?.isValid(phoneInput)) {
      setPartnerPhoneError(tr('Please enter a valid phone number for the selected country.', 'Pakilagay ang valid na phone number para sa napiling bansa.'));
      phoneInput?.focus();
      return;
    }
    setPartnerPhoneError('');
    const phoneE164 = window.gcbPhone?.number(phoneInput) ?? (phoneInput?.value || '');

    setPartnerSubmitState('sending');
    try {
      const payload = {
        inquiryType: PARTNER_INQUIRY_TYPE,
        turnstileToken: partnerTurnstile.token,
        fullName: partnerFormData.name,
        email: partnerFormData.email,
        phone: phoneE164,
        message: partnerFormData.message,
        // Mirrored into subject so a sheet column or email template that only knows
        // the generic "Company/Organization" wording still resolves the institution.
        subject: partnerFormData.institution,
        additionalData: {
          position: partnerFormData.position,
          prcLicense: partnerFormData.prcLicense,
          institution: partnerFormData.institution,
          location: partnerFormData.location,
          consent: partnerFormData.consent ? 'Confirmed' : '',
          customerType: USER_TYPE_LABELS[orderUserType] || orderUserType,
        },
        files: []
      };

      const submission = await submitInquiry(payload, {
        endpoint: getApiUrl(),
        returnPath: formReturnPath,
      });
      // A queued inquiry is not a delivered one, so only a real send
      // opens the success modal; QueuedInquiryNotice reports the rest.
      if (submission.status === 'failed') throw new Error(submission.error);
      warnIfRowLost(submission.status === 'sent' ? submission.body : null, PARTNER_INQUIRY_TYPE);

      setPartnerSubmitState('sent');
      setPartnerFormData(emptyPartnerForm);
      if (partnerPhoneRef.current) partnerPhoneRef.current.value = '';
      partnerTurnstile.reset();
      setSuccessKind('inquiry');
      submission.status === 'sent' && setSuccessModalOpen(true);
      setTimeout(() => setPartnerSubmitState('idle'), 300);
    } catch (error) {
      console.error('Partner inquiry submission error:', error);
      partnerTurnstile.reset();
      setPartnerSubmitState('error');
      setTimeout(() => setPartnerSubmitState('idle'), 2000);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientIdFile) {
      setIdRequiredModalOpen(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIdModalVisible(true)));
      return;
    }
    if (!formData.patientName || !formData.email || !formData.phone || !formData.age || !formData.address) {
      showAlert(tr('Please fill in all required fields.', 'Pakisagutan ang lahat ng kailangang field.'));
      return;
    }
    const expectedPhoneDigits = (phoneCountry.mask.match(/#/g) || []).length;
    if (formData.phone.replace(/\D/g, '').length !== expectedPhoneDigits) {
      showAlert(tr('Please enter a valid phone number.', 'Pakilagay ang valid na phone number.'));
      return;
    }
    if (!contactSameAsPatient && !formData.contactName) {
      showAlert(tr("Please provide the contact person's full name.", 'Pakilagay ang buong pangalan ng contact person.'));
      return;
    }
    if (!formData.terms) {
      showAlert(tr('Please confirm that all provided information is authentic.', 'Pakikumpirma na totoo ang lahat ng ibinigay na impormasyon.'));
      return;
    }
    if (!formData.privacyConsent) {
      showAlert(tr('Please consent to the Privacy Policy to proceed.', 'Pumayag muna sa Privacy Policy para makapagpatuloy.'));
      return;
    }
    setSubmitState('sending');

    const filesData: { name: string; type: string; base64: string; category: 'id' | 'prescription' }[] = [];
    for (const file of uploadedFiles) {
      try {
        const base64 = await fileToBase64(file);
        filesData.push({ name: file.name, type: file.type, base64, category: 'prescription' });
      } catch (err) {
        console.error('Error processing file:', file.name, err);
      }
    }
    try {
      const base64 = await fileToBase64(patientIdFile);
      filesData.push({ name: patientIdFile.name, type: patientIdFile.type, base64, category: 'id' });
    } catch (err) {
      console.error('Error processing file:', patientIdFile.name, err);
    }

    const contactInfo = contactSameAsPatient
      ? 'Same as patient'
      : `${formData.contactName}${formData.contactRelationship ? ` (${formData.contactRelationship})` : ''}`;

    try {
      const payload = {
        inquiryType: 'Order Medicine',
        turnstileToken: orderTurnstile.token,
        fullName: formData.patientName,
        email: formData.email,
        phone: `${phoneCountry.code} ${formData.phone}`,
        message: `Medicine Order Request. DOB: ${formData.dob}, Age: ${formData.age}, Address: ${formData.address}, Contact Person: ${contactInfo}`,
        additionalData: {
          dob: formData.dob,
          age: formData.age,
          address: formData.address,
          contactSameAsPatient,
          contactName: formData.contactName,
          contactRelationship: formData.contactRelationship,
          privacyPolicyConsent: formData.privacyConsent
        },
        files: filesData
      };

      const submission = await submitInquiry(payload, {
        endpoint: getApiUrl(),
        returnPath: formReturnPath,
      });
      // Tokens are single-use, so the solved widget is replaced whatever the outcome.
      orderTurnstile.reset();
      // A queued inquiry is not a delivered one, so only a real send
      // opens the success modal; QueuedInquiryNotice reports the rest.
      if (submission.status === 'failed') throw new Error(submission.error);

      setSubmitState('sent');
      setValidationSubmitted(true);
      setSuccessKind('order');
      submission.status === 'sent' && setSuccessModalOpen(true);
    } catch (error) {
      console.error('Submission error:', error);
      setSubmitState('error');
      setTimeout(() => setSubmitState('idle'), 2000);
    }
  };

  // Slider auto-advance (kept for state compatibility)
  useEffect(() => {
    slideIntervalRef.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % totalSlides);
    }, 4000);
    return () => { if (slideIntervalRef.current) clearInterval(slideIntervalRef.current); };
  }, []);

  // Clear upload timers on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
      if (uploadTimeoutRef.current) clearTimeout(uploadTimeoutRef.current);
    };
  }, []);

  const goToSlide = (index: number) => {
    if (slideIntervalRef.current) clearInterval(slideIntervalRef.current);
    setCurrentSlide(index);
    slideIntervalRef.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % totalSlides);
    }, 4000);
  };

  const openUploadModal = () => {
    setModalOpen(true);
    setProgress(0);
    let prog = 0;
    uploadIntervalRef.current = setInterval(() => {
      prog += Math.floor(Math.random() * 15) + 5;
      if (prog >= 100) {
        prog = 100;
        if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
        uploadTimeoutRef.current = setTimeout(() => {
          setUploadComplete(true);
          closeUploadModal();
        }, 500);
      }
      setProgress(prog);
    }, 400);
  };

  const closeUploadModal = () => {
    setModalOpen(false);
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    if (uploadTimeoutRef.current) clearTimeout(uploadTimeoutRef.current);
    uploadTimeoutRef.current = setTimeout(() => setProgress(0), 300);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const { valid, errors } = validateFiles(Array.from(e.target.files));
      if (errors.length > 0) showAlert(errors, tr('Invalid File', 'Hindi valid ang file'));
      if (valid.length > 0) {
        setUploadedFiles(prev => [...prev, ...valid]);
        openUploadModal();
      }
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (!phoneCountryOpen) return;
    const close = () => setPhoneCountryOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [phoneCountryOpen]);

  useEffect(() => {
    if (!ageDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (ageDropdownRef.current && !ageDropdownRef.current.contains(e.target as Node)) {
        setAgeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ageDropdownOpen]);

  useEffect(() => {
    const caObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          (entry.target as Element).classList.add('ca-in');
          caObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.ca-anim').forEach(el => caObserver.observe(el));
    return () => caObserver.disconnect();
  }, []);

  // Suppress unused warning — goToSlide kept for potential external use
  void goToSlide;
  void currentSlide;

  // Hospital-only trust content. Replaces the patient-facing "Support & Trust"
  // cards, which talk about prescription uploads and dispensing — neither of
  // which applies to an institutional procurement inquiry.
  const HOSPITAL_CREDENTIALS = [
    {
      Icon: BadgeCheck,
      title: tr('Fully Licensed Pharmaceutical Company', 'Kumpletong Lisensyadong Pharmaceutical Company'),
      desc: tr('FDA Philippines-licensed wholesaler, importer, distributor, and retail pharmacy. PDEA-licensed across LTO categories S1 to S5 for controlled substance supply.', 'Wholesaler, importer, distributor at retail pharmacy na lisensyado ng FDA Philippines. May PDEA license sa LTO categories S1 hanggang S5 para sa supply ng controlled substances.'),
    },
    {
      Icon: Factory,
      title: tr('International Manufacturing Standards', 'Internasyonal na Pamantayan sa Paggawa'),
      desc: tr('Our medicines are manufactured and sourced internationally in compliance with global quality standards \u2014 ensuring consistent safety, efficacy, and reliability for your patients.', 'Ang aming mga gamot ay ginagawa at kinukuha sa ibang bansa alinsunod sa global quality standards \u2014 para sa tuloy-tuloy na kaligtasan, bisa at pagiging maaasahan para sa inyong mga pasyente.'),
    },
    {
      Icon: FileCheck,
      title: tr('Complete Regulatory Documentation', 'Kumpletong Regulatory Documentation'),
      desc: tr('Every hospital order comes with Certificate of Analysis, batch records, cold-chain temperature logs, Certificate of Product Registration, and country-of-origin certification.', 'Bawat hospital order ay may kasamang Certificate of Analysis, batch records, cold-chain temperature logs, Certificate of Product Registration at country-of-origin certification.'),
    },
    {
      Icon: Truck,
      title: tr('Nationwide Hospital Delivery', 'Hospital Delivery sa Buong Bansa'),
      desc: tr('GDP-compliant delivery to hospitals across Luzon, Visayas, and Mindanao, with cold-chain handling for biologics, vaccines, and specialty medicines.', 'Delivery na sumusunod sa GDP para sa mga ospital sa buong Luzon, Visayas at Mindanao, may cold-chain handling para sa biologics, bakuna at specialty medicines.'),
    },
    {
      Icon: Headset,
      title: tr('Dedicated Hospital Account Support', 'Dedicated na Suporta sa Hospital Account'),
      desc: tr('A dedicated account manager, formulary-ready documentation, and standing supply agreements \u2014 for hospitals that need a serious pharmaceutical partner.', 'May dedicated na account manager, formulary-ready na dokumentasyon at standing supply agreement \u2014 para sa mga ospital na kailangan ng seryosong pharmaceutical partner.'),
    },
    {
      Icon: Gavel,
      title: tr('Government Bidding & Formulary Support', 'Suporta sa Government Bidding at Formulary'),
      desc: tr('Complete documentation for DOH, LGU, and government tenders, including Product Inserts and safety data for formulary requirements.', 'Kumpletong dokumentasyon para sa DOH, LGU at government tender, kasama ang Product Inserts at safety data para sa formulary requirements.'),
    },
    {
      Icon: Siren,
      title: tr('Emergency Order Coordination', 'Koordinasyon ng Emergency Order'),
      desc: tr('Urgent-order coordination for critical care and time-sensitive hospital requirements.', 'Koordinasyon ng urgent na order para sa critical care at mga kailangan ng ospital na hindi makapaghihintay.'),
    },
  ];

  const PHARMACY_CREDENTIALS = [
    {
      Icon: BadgeCheck,
      title: tr('FDA-Licensed Pharmaceutical Distributor and Importer', 'Pharmaceutical Distributor at Importer na Lisensyado ng FDA'),
      desc: tr('FDA Philippines-licensed wholesaler, importer, distributor, and retail pharmacy. PDEA-licensed across LTO categories S1 to S5 for controlled substance supply \u2014 fully compliant sourcing for your pharmacy.', 'Wholesaler, importer, distributor at retail pharmacy na lisensyado ng FDA Philippines. May PDEA license sa LTO categories S1 hanggang S5 para sa supply ng controlled substances \u2014 sumusunod sa lahat ng regulasyon ang sourcing para sa inyong botika.'),
    },
    {
      Icon: Boxes,
      title: tr('Wide Product Portfolio', 'Malawak na Product Portfolio'),
      desc: tr('A broad catalog of generic and specialty pharmaceutical products under our own in-house brands \u2014 sourced and manufactured internationally in compliance with global quality standards.', 'Malawak na catalog ng generic at specialty pharmaceutical products sa ilalim ng sarili naming mga brand \u2014 kinukuha at ginagawa sa ibang bansa alinsunod sa global quality standards.'),
    },
    {
      Icon: Tags,
      title: tr('Competitive Wholesale Pricing', 'Abot-kayang Wholesale na Presyo'),
      desc: tr('Volume-based pricing tiers and flexible credit terms designed for independent pharmacies, drugstore chains, and multi-branch operations.', 'Presyong nakabatay sa dami at flexible na credit terms para sa mga independent pharmacy, drugstore chain at mga may maraming branch.'),
    },
    {
      Icon: CreditCard,
      title: tr('Flexible Order & Payment Terms', 'Flexible na Order at Payment Terms'),
      desc: tr('Minimum order flexibility and credit terms for qualified accounts \u2014 built to reduce risk for independent pharmacy owners.', 'Flexible na minimum order at credit terms para sa mga kwalipikadong account \u2014 para mabawasan ang risk ng mga independent pharmacy owner.'),
    },
    {
      Icon: PackageCheck,
      title: tr('Reliable Replenishment & Logistics', 'Maaasahang Replenishment at Logistics'),
      desc: tr('Consistent stock availability, fast dispatch, and GDP-compliant distribution \u2014 including cold-chain handling for temperature-sensitive products \u2014 to keep your shelves stocked.', 'Tuloy-tuloy na stock, mabilis na dispatch at distribution na sumusunod sa GDP \u2014 kasama ang cold-chain handling para sa mga produktong sensitibo sa temperatura \u2014 para laging puno ang inyong mga shelf.'),
    },
    {
      Icon: ClipboardCheck,
      title: tr('Complete Product Documentation', 'Kumpletong Product Documentation'),
      desc: tr('We are dedicated to providing all documents needed for compliant sourcing \u2014 Certificate of Analysis, cGMP certification, local assay certificates, Certificate of Product Registration, anti-counterfeit batch notifications, and ISO certification.', 'Ibinibigay namin ang lahat ng dokumentong kailangan para sa compliant na sourcing \u2014 Certificate of Analysis, cGMP certification, local assay certificates, Certificate of Product Registration, anti-counterfeit batch notifications at ISO certification.'),
    },
    {
      Icon: UserRoundCheck,
      title: tr('Dedicated Distributor Account Support', 'Dedicated na Suporta sa Distributor Account'),
      desc: tr('A dedicated account manager to handle reordering, new product requests, and account-specific pricing \u2014 built for long-term partnership, not one-off transactions.', 'May dedicated na account manager para sa reorder, request ng bagong produkto at presyong para sa inyong account \u2014 para sa pangmatagalang partnership, hindi one-time na transaksyon.'),
    },
  ];

  const DOCTOR_CREDENTIALS = [
    {
      Icon: BadgeCheck,
      title: tr('FDA-Licensed Pharmaceutical Company', 'Pharmaceutical Company na Lisensyado ng FDA'),
      desc: tr('FDA Philippines-licensed wholesaler, importer, distributor, and retail pharmacy. PDEA-licensed across LTO categories S1 to S5 for controlled substance supply.', 'Wholesaler, importer, distributor at retail pharmacy na lisensyado ng FDA Philippines. May PDEA license sa LTO categories S1 hanggang S5 para sa supply ng controlled substances.'),
    },
    {
      Icon: Factory,
      title: tr('International Manufacturing Standards', 'Internasyonal na Pamantayan sa Paggawa'),
      desc: tr('Our medicines are manufactured and sourced internationally in compliance with global quality standards \u2014 ensuring consistent safety, efficacy, and reliability for your patients.', 'Ang aming mga gamot ay ginagawa at kinukuha sa ibang bansa alinsunod sa global quality standards \u2014 para sa tuloy-tuloy na kaligtasan, bisa at pagiging maaasahan para sa inyong mga pasyente.'),
    },
    {
      Icon: Stethoscope,
      title: tr('Direct Product Access', 'Direktang Access sa Produkto'),
      desc: tr('Order directly from us \u2014 no resellers, no middlemen. Every order comes with accurate product information, Certificate of Product Registration, and Product Inserts.', 'Direktang mag-order sa amin \u2014 walang reseller, walang middleman. Bawat order ay may kasamang tamang impormasyon ng produkto, Certificate of Product Registration at Product Inserts.'),
    },
    {
      Icon: Truck,
      title: tr('Fast, Reliable Fulfillment', 'Mabilis at Maaasahang Fulfillment'),
      desc: tr('Fast dispatch and GDP-compliant distribution, including cold-chain handling for temperature-sensitive products, delivered to your clinic or practice.', 'Mabilis na dispatch at distribution na sumusunod sa GDP, kasama ang cold-chain handling para sa mga produktong sensitibo sa temperatura, ide-deliver sa inyong klinika o practice.'),
    },
    {
      Icon: HeartPulse,
      title: tr('Patient-First Medical & Sales Support', 'Medical at Sales Support na Pasyente ang Inuuna'),
      desc: tr("Direct access to our team for product inquiries, order coordination, sample requests, and documentation \u2014 because your patients' needs come first.", 'Direktang access sa aming team para sa product inquiry, koordinasyon ng order, sample request at dokumentasyon \u2014 dahil inuuna namin ang kailangan ng inyong mga pasyente.'),
    },
  ];

  const CSP_COMMON_USES = [
    tr('Rare disease and orphan drug treatments', 'Gamutan para sa rare disease at orphan drug'),
    tr('Oncology medicines not yet locally registered', 'Mga gamot sa oncology na hindi pa rehistrado dito'),
    tr('Specialty biologics unavailable through standard channels', 'Specialty biologics na hindi makukuha sa karaniwang paraan'),
  ];

  const CSP_HOW_IT_WORKS = [
    tr("Submit your patient's or institution's clinical requirement and product details", 'Ipadala ang clinical requirement ng inyong pasyente o institusyon at ang detalye ng produkto'),
    tr('Our team coordinates sourcing and FDA/CSP documentation', 'Ang aming team ang mag-aasikaso ng sourcing at FDA/CSP documentation'),
    tr('Product is imported and delivered under compassionate-use provisions', 'Ini-import at dine-deliver ang produkto sa ilalim ng compassionate-use provisions'),
  ];

  const ADVERSE_EVENT_CONTACT = {
    name: 'Ivy Marcel F. Varias, RPh',
    role: 'Head, Regulatory Affairs',
    address: 'Unit 301 & 305, 17 Vatican Bldg., Vatican City Drive, B.F. Resort Village, Talon II, Las Pi\u00f1as City',
    email: 'dra2@2mginc.com',
    phones: [
      { label: '(02) 8709 1617', href: 'tel:+63287091617' },
      { label: '0994 564 8227', href: 'tel:+639945648227' },
    ],
  };

  const PARTNERSHIP_STEPS = [
    { title: tr('Submit your inquiry', 'Ipadala ang inyong inquiry'), desc: tr('Tell us about your pharmacy and product needs', 'Sabihin sa amin ang tungkol sa inyong botika at mga kailangang produkto') },
    { title: tr('Verification & account setup', 'Verification at account setup'), desc: tr('We confirm your business documents and set your account terms', 'Kinukumpirma namin ang inyong business documents at sine-set ang inyong account terms') },
    { title: tr('Catalog & pricing', 'Catalog at presyo'), desc: tr('Receive your product catalog and wholesale price list', 'Matanggap ang inyong product catalog at wholesale price list') },
    { title: tr('Start ordering', 'Magsimulang mag-order'), desc: tr('Place your first order with ongoing account manager support', 'Ilagay ang unang order na may tuloy-tuloy na suporta ng account manager') },
  ];

  const THERAPEUTIC_AREAS = [
    { icon: 'fa-ribbon', name: 'Oncology', desc: tr('Anti-cancer medicines and supportive care products', 'Mga gamot laban sa cancer at supportive care products') },
    { icon: 'fa-droplet', name: 'Hematology', desc: tr('Blood disorder treatments and related specialty products', 'Gamutan sa sakit sa dugo at kaugnay na specialty products') },
    { icon: 'fa-syringe', name: 'Anesthesia', desc: tr('Anesthetic and perioperative medicines for surgical and critical care use', 'Anesthetic at perioperative na gamot para sa operasyon at critical care') },
    { icon: 'fa-dna', name: tr('Rare Diseases', 'Rare Diseases'), desc: tr('Specialty and orphan drug medicines for rare disease treatment', 'Specialty at orphan drug na gamot para sa rare disease') },
    { icon: 'fa-pills', name: tr('Essential Medicines', 'Essential Medicines'), desc: tr('Core hospital formulary drugs for everyday clinical needs', 'Pangunahing gamot sa hospital formulary para sa pang-araw-araw na clinical needs') },
  ];

  const HOSPITAL_REACH_STATS = [
    { value: '2,000+', label: tr('molecules', 'molecule') },
    { value: '500+', label: tr('hospitals', 'ospital') },
    { value: '10,000+', label: tr('pharmacies', 'botika') },
  ];

  const CSP_USE_TYPES = [
    { name: tr('Institutional Use', 'Institutional Use'), desc: tr('for hospitals requiring unregistered medicines for broader patient care needs', 'para sa mga ospital na nangangailangan ng hindi rehistradong gamot para sa mas malawak na pangangalaga ng pasyente') },
    { name: tr('Named Patient Use', 'Named Patient Use'), desc: tr('for a specific, individually identified patient requiring an unregistered medicine', 'para sa isang partikular na pasyente na nangangailangan ng hindi rehistradong gamot') },
  ];

  const PARTNER_TRUST = isDoctorUserType
    ? {
        credentialsHeading: tr('Why Doctors & Healthcare Professionals Choose Getmeds', 'Bakit Getmeds ang Pinipili ng mga Doktor at Healthcare Professional'),
        credentials: DOCTOR_CREDENTIALS,
        credentialsTitleSpan: 'lg:col-span-1',
        therapeuticIntro: tr('Getmeds supports doctors and healthcare professionals with a focused portfolio across critical and specialty therapeutic categories, backed by proper documentation and cold-chain handling where required.', 'Sinusuportahan ng Getmeds ang mga doktor at healthcare professional ng nakatutok na portfolio sa critical at specialty therapeutic categories, may tamang dokumentasyon at cold-chain handling kung kailangan.'),
        areasWeServe: '',
        showCsp: true,
        cspIntro: tr('For patients who need access to medicines not yet registered in the Philippines, Compassionate Special Permit (CSP) coordination is facilitated through 2MG Inc., our trusted partner company specializing in compassionate-use and unregistered drug importation.', 'Para sa mga pasyenteng nangangailangan ng gamot na hindi pa rehistrado sa Pilipinas, ang koordinasyon ng Compassionate Special Permit (CSP) ay isinasagawa sa pamamagitan ng 2MG Inc., ang aming pinagkakatiwalaang partner company na dalubhasa sa compassionate-use at pag-import ng hindi rehistradong gamot.'),
        cspUseTypes: [
          { name: tr('Named Patient Use', 'Named Patient Use'), desc: tr('for a specific, individually identified patient requiring an unregistered medicine', 'para sa isang partikular na pasyente na nangangailangan ng hindi rehistradong gamot') },
          { name: tr('Institutional Use', 'Institutional Use'), desc: tr('for hospitals and healthcare institutions requiring unregistered medicines for broader patient care needs', 'para sa mga ospital at healthcare institution na nangangailangan ng hindi rehistradong gamot para sa mas malawak na pangangalaga ng pasyente') },
        ],
        cspCommonUses: CSP_COMMON_USES,
        cspHowItWorks: CSP_HOW_IT_WORKS,
        cspNote: tr('This process requires physician or institutional initiation and is subject to FDA approval and applicable regulations.', 'Kailangang simulan ito ng physician o institusyon at depende sa pag-apruba ng FDA at sa mga naaangkop na regulasyon.'),
        reachHeading: tr('Trusted by Healthcare Professionals Nationwide', 'Pinagkakatiwalaan ng mga Healthcare Professional sa Buong Bansa'),
        reachStats: [
          { value: '500+', label: tr('hospitals', 'ospital') },
          { value: '10,000+', label: tr('pharmacies', 'botika') },
          { value: '2,000+', label: tr('molecules', 'molecule') },
        ],
        reachBlurb: tr('From Luzon to Visayas to Mindanao \u2014 Getmeds supports doctors and healthcare professionals with reliable product access and support nationwide.', 'Mula Luzon hanggang Visayas at Mindanao \u2014 sinusuportahan ng Getmeds ang mga doktor at healthcare professional ng maaasahang access sa produkto at suporta sa buong bansa.'),
      }
    : isPharmacyUserType
    ? {
        credentialsHeading: tr('Your Trusted Pharmaceutical Distributor and Importer in the Philippines', 'Ang Inyong Pinagkakatiwalaang Pharmaceutical Distributor at Importer sa Pilipinas'),
        credentials: PHARMACY_CREDENTIALS,
        credentialsTitleSpan: 'lg:col-span-2',
        therapeuticIntro: tr('Getmeds distributes a focused portfolio across key therapeutic categories, giving your pharmacy access to both everyday essentials and specialty products your customers may not find elsewhere.', 'Nagdi-distribute ang Getmeds ng nakatutok na portfolio sa mga pangunahing therapeutic category, para may access ang inyong botika sa pang-araw-araw na essentials at specialty products na maaaring hindi makita ng inyong customers sa iba.'),
        areasWeServe: tr('Getmeds supplies independent pharmacies, drugstore chains, and multi-branch pharmacy partners across the Philippines \u2014 including Metro Manila, Cebu, Davao, and provincial areas nationwide.', 'Nagsu-supply ang Getmeds sa mga independent pharmacy, drugstore chain at multi-branch pharmacy partner sa buong Pilipinas \u2014 kasama ang Metro Manila, Cebu, Davao at mga probinsya sa buong bansa.'),
        showCsp: false,
        cspIntro: '', cspUseTypes: [], cspCommonUses: [], cspHowItWorks: [], cspNote: '',
        reachHeading: tr('Supplying Distributors Across the Philippines', 'Nagsu-supply sa mga Distributor sa Buong Pilipinas'),
        reachStats: HOSPITAL_REACH_STATS,
        reachBlurb: tr('From Luzon to Visayas to Mindanao \u2014 Getmeds is the distributor of choice for independent pharmacies, drugstore chains, and retail pharmacy partners nationwide.', 'Mula Luzon hanggang Visayas at Mindanao \u2014 Getmeds ang piniling distributor ng mga independent pharmacy, drugstore chain at retail pharmacy partner sa buong bansa.'),
      }
    : {
        credentialsHeading: tr('Your Trusted Pharmaceutical Supplier for Philippine Hospitals', 'Ang Inyong Pinagkakatiwalaang Pharmaceutical Supplier para sa mga Ospital sa Pilipinas'),
        credentials: HOSPITAL_CREDENTIALS,
        credentialsTitleSpan: 'lg:col-span-2',
        therapeuticIntro: tr('Getmeds supplies hospitals with a focused portfolio across critical and specialty therapeutic categories, backed by proper documentation and cold-chain handling where required.', 'Nagsu-supply ang Getmeds sa mga ospital ng nakatutok na portfolio sa critical at specialty therapeutic categories, may tamang dokumentasyon at cold-chain handling kung kailangan.'),
        areasWeServe: '',
        showCsp: true,
        cspIntro: tr('For patients or institutional needs requiring medicines not yet registered in the Philippines, Compassionate Special Permit (CSP) coordination is facilitated through 2MG Inc., our trusted partner company specializing in compassionate-use and unregistered drug importation.', 'Para sa mga pasyente o institusyong nangangailangan ng gamot na hindi pa rehistrado sa Pilipinas, ang koordinasyon ng Compassionate Special Permit (CSP) ay isinasagawa sa pamamagitan ng 2MG Inc., ang aming pinagkakatiwalaang partner company na dalubhasa sa compassionate-use at pag-import ng hindi rehistradong gamot.'),
        cspUseTypes: CSP_USE_TYPES,
        cspCommonUses: [],
        cspHowItWorks: [],
        cspNote: tr('This process requires institutional or physician initiation and is subject to FDA approval and applicable regulations.', 'Kailangang simulan ito ng institusyon o physician at depende sa pag-apruba ng FDA at sa mga naaangkop na regulasyon.'),
        reachHeading: tr('Serving Hospitals Across the Philippines', 'Naglilingkod sa mga Ospital sa Buong Pilipinas'),
        reachStats: HOSPITAL_REACH_STATS,
        reachBlurb: tr('From Luzon to Visayas to Mindanao \u2014 Getmeds is trusted by leading Filipino hospitals, healthcare institutions, and pharmaceutical partners.', 'Mula Luzon hanggang Visayas at Mindanao \u2014 pinagkakatiwalaan ang Getmeds ng mga nangungunang ospital, healthcare institution at pharmaceutical partner sa Pilipinas.'),
      };

  const GUIDE_ITEMS = [
    tr("Patient's full name", 'Buong pangalan ng pasyente'),
    tr("Medicine name, dosage, and quantity", 'Pangalan ng gamot, dosage at dami'),
    tr("Prescribing physician's name and PRC license number", 'Pangalan ng nagresetang doktor at numero ng PRC license'),
    tr("Clinic/hospital address and physician's signature", 'Address ng klinika/ospital at pirma ng doktor'),
    tr("Valid date", 'Valid na petsa'),
  ];

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }} className="bg-white text-gray-800 antialiased">
      <style>{`
        @media (max-width: 767px) {
          html { scroll-behavior: smooth; }
        }

        .ca-anim{opacity:0}
        .ca-anim.ca-in{animation-fill-mode:both}
        .ca-up.ca-in{animation:caFadeUp 0.65s cubic-bezier(0.22,1,0.36,1) both}
        .ca-left.ca-in{animation:caFadeLeft 0.65s cubic-bezier(0.22,1,0.36,1) both}
        .ca-right.ca-in{animation:caFadeRight 0.65s cubic-bezier(0.22,1,0.36,1) both}
        .ca-zoom.ca-in{animation:caZoomIn 0.6s cubic-bezier(0.22,1,0.36,1) both}
        .ca-fade.ca-in{animation:caFadeIn 0.7s ease both}
        .ca-d1.ca-in{animation-delay:0.1s}.ca-d2.ca-in{animation-delay:0.2s}
        .ca-d3.ca-in{animation-delay:0.3s}.ca-d4.ca-in{animation-delay:0.4s}
        .ca-d5.ca-in{animation-delay:0.5s}.ca-d6.ca-in{animation-delay:0.6s}
        @keyframes caFadeUp{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
        @keyframes caFadeLeft{from{opacity:0;transform:translateX(-44px)}to{opacity:1;transform:translateX(0)}}
        @keyframes caFadeRight{from{opacity:0;transform:translateX(44px)}to{opacity:1;transform:translateX(0)}}
        @keyframes caZoomIn{from{opacity:0;transform:scale(0.88)}to{opacity:1;transform:scale(1)}}
        @keyframes caFadeIn{from{opacity:0}to{opacity:1}}
      `}</style>


      <div className="overflow-x-hidden">

        {/* The hub carries no forms — it exists to send the visitor to one of the
            four audience pages below it. Everything after this point is an audience
            page, and only renders once the URL has named one. */}
        {isHub ? <OrderMedicinesHub /> : (<>
        {/* ── Hero + Step Cards ── */}
        <section className="w-full px-4 md:px-6 pt-5 pb-4">
          <div
            className="relative rounded-[20px] overflow-hidden px-8 md:px-14 pt-12"
            style={{ background: 'linear-gradient(135deg, #3aaf5c 0%, #1ab8c4 45%, #1a99d6 100%)' }}
          >
            {/* Decorative glassy circles */}
            <div className="absolute pointer-events-none" style={{ width: 160, height: 160, borderRadius: '50%', bottom: '-55px', left: '28%', background: 'radial-gradient(circle at 40% 35%, rgba(100,240,200,0.55), rgba(30,180,210,0.30))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.25)' }} />
            <div className="absolute pointer-events-none" style={{ width: 130, height: 130, borderRadius: '50%', bottom: '-42px', left: '45%', background: 'radial-gradient(circle at 38% 30%, rgba(120,100,240,0.55), rgba(60,80,220,0.35))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.20)' }} />
            <div className="absolute pointer-events-none hidden md:block" style={{ width: 180, height: 180, borderRadius: '50%', bottom: '-70px', right: '8%', background: 'radial-gradient(circle at 42% 38%, rgba(130,230,230,0.45), rgba(60,190,210,0.22))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.22)' }} />
            <div className="absolute pointer-events-none hidden md:block" style={{ width: 90, height: 90, borderRadius: '50%', bottom: '-20px', left: '18%', background: 'radial-gradient(circle at 35% 30%, rgba(160,240,120,0.60), rgba(40,210,130,0.35))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.25)' }} />
            <div className="absolute pointer-events-none hidden md:block" style={{ width: 52, height: 52, borderRadius: '50%', top: '10px', right: '28%', background: 'radial-gradient(circle at 35% 30%, rgba(170,110,240,0.70), rgba(100,60,210,0.45))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.25)' }} />
            <div className="absolute pointer-events-none hidden md:block" style={{ width: 85, height: 85, borderRadius: '50%', top: '-15px', right: '38%', background: 'radial-gradient(circle at 38% 32%, rgba(80,220,210,0.55), rgba(30,170,200,0.30))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.22)' }} />

            <div className="relative z-10">
              <h1 className="ca-anim ca-up text-xl sm:text-2xl md:text-3xl font-semibold text-white tracking-tight leading-tight mb-1">
                {heroCopy.title}
              </h1>
              {heroCopy.tagline && (
                <p className="ca-anim ca-up ca-d1 text-white text-[14px] sm:text-[15px] font-semibold leading-snug mt-1">
                  {heroCopy.tagline}
                </p>
              )}
              <p className={`ca-anim ca-up ca-d2 text-[12px] sm:text-[13px] mt-1 font-medium mb-10 max-w-3xl leading-relaxed ${isPartnerUserType ? 'text-white' : 'text-white/75'}`}>
                {heroCopy.subtitle}
              </p>

              {/* Step Cards — patient prescription flow only */}
              {!isProfessionalUserType && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-10">
                  {[
                    {
                      icon: 'fa-cloud-arrow-up',
                      label: tr('1. Upload', '1. Mag-upload'),
                      desc: tr('Upload your valid prescription and contact details.', 'I-upload ang inyong valid na reseta at contact details.')
                    },
                    {
                      icon: 'fa-phone-volume',
                      label: tr('2. We reach out', '2. Kokontakin namin kayo'),
                      desc: tr('Our pharmacists contact you to verify your order.', 'Kokontakin kayo ng aming pharmacist para i-verify ang order.')
                    },
                    {
                      icon: 'fa-circle-check',
                      label: tr('3. Receive Your Order', '3. Tanggapin ang Order'),
                      desc: tr('Get your order confirmed and delivered.', 'Makumpirma at ma-deliver ang inyong order.')
                    }
                  ].map((step, i) => (
                    <div key={i} className={`ca-anim ca-zoom ${['ca-d1', 'ca-d3', 'ca-d5'][i]} bg-white/10 backdrop-blur-sm rounded-[15px] border border-white/20 p-4 md:p-6 flex flex-row items-center md:flex-col md:items-center text-left md:text-center cursor-default`}>
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0 mr-4 md:mr-0 md:mb-4">
                        <i className={`fa-solid ${step.icon} text-white text-lg md:text-xl`}></i>
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-white font-bold text-[14px] md:text-[15px] mb-1 md:mb-3">{step.label}</h3>
                        <p className="text-white/80 md:text-white text-[12px] leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Main Content ── */}
        <section className="py-10 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

            {/* Patient prescription-order flow (default/unset/skipped user type) */}
            {!isProfessionalUserType && (
            <>
            {/* Guide + Upload layout — guide shown first so users are instructed before uploading */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

              {/* LEFT: Guide for Valid Prescription */}
              <div className="lg:col-span-2 ca-anim ca-left bg-white rounded-[15px] border border-gray-100 p-8 shadow-sm">
                <h2 className="text-[17px] font-semibold text-dark mb-1">{tr('Guide for a valid prescription', 'Gabay para sa valid na reseta')}</h2>
                <p className="text-gray-400 text-[12px] mb-6">{tr('Please ensure the document includes:', 'Siguraduhing nakalagay sa dokumento ang:')}</p>
                <ul className="space-y-3.5">
                  {GUIDE_ITEMS.map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <i className="fa-solid fa-check text-[9px] text-green-600"></i>
                      </div>
                      <span className="text-[13px] font-semibold text-gray-800">{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-gray-400 mt-5 leading-relaxed">
                  {tr('All details must be clear and legible for verification.', 'Dapat malinaw at nababasa ang lahat ng detalye para sa verification.')}
                </p>
              </div>

              {/* RIGHT: Upload Prescription Card */}
              <div className="lg:col-span-3 ca-anim ca-left ca-d2 bg-white rounded-[15px] border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-[12px] flex items-center justify-center text-white shadow-md"
                    style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)' }}>
                    <i className="fa-solid fa-file-prescription text-base"></i>
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-dark tracking-tight">{tr('Upload prescription', 'Mag-upload ng reseta')}</h2>
                    <p className="text-gray-400 text-[11px] mt-0.5">{tr('Accepted formats: JPEG, PNG, PDF', 'Tinatanggap na format: JPEG, PNG, PDF')}</p>
                  </div>
                </div>

                {/* Upload Zone */}
                <label className="group cursor-pointer block mb-3">
                  <input type="file" multiple accept={ALLOWED_FILE_TYPES_ACCEPT} className="hidden" onChange={handleFileChange} />
                  <div className="border-2 border-dashed border-gray-200 rounded-[15px] p-5 flex flex-col items-center justify-center text-center transition-all group-hover:border-primary/40 group-hover:bg-blue-50/20">
                    <div className="text-gray-300 group-hover:text-primary transition-colors duration-200 mb-3">
                      <i className="fa-solid fa-cloud-arrow-up text-4xl"></i>
                    </div>
                    <p className="text-[13px] text-gray-400 mb-3">{tr('Click to browse — multiple files allowed', 'I-click para pumili — puwede ang maraming file')}</p>
                    <span className="inline-block bg-dark group-hover:bg-primary text-white text-[13px] font-semibold px-5 py-2 rounded-[10px] transition-colors duration-200">
                      {tr('Browse files', 'Pumili ng file')}
                    </span>
                  </div>
                </label>

                {/* File Preview */}
                <div className="border border-gray-100 rounded-[15px] bg-gray-50/50 overflow-hidden" style={{ minHeight: '90px' }}>
                  {uploadedFiles.length > 0 ? (
                    <div className="p-3 grid grid-cols-3 gap-2">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="relative group/thumb">
                          {file.type.startsWith('image/') ? (
                            <button type="button" onClick={() => setViewingFileUrl(URL.createObjectURL(file))}
                              className="w-full aspect-square rounded-[10px] overflow-hidden border border-gray-100 bg-white block">
                              <img src={URL.createObjectURL(file)} alt={file.name}
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                            </button>
                          ) : (
                            <div className="w-full aspect-square rounded-[10px] border border-gray-100 bg-white flex flex-col items-center justify-center gap-1 px-1">
                              <i className="fa-solid fa-file-pdf text-red-400 text-xl"></i>
                              <span className="text-[9px] text-gray-400 text-center truncate w-full px-1 leading-tight">{file.name}</span>
                            </div>
                          )}
                          <button type="button"
                            onClick={() => {
                              const updated = uploadedFiles.filter((_, i) => i !== idx);
                              setUploadedFiles(updated);
                              if (updated.length === 0) setUploadComplete(false);
                            }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 transition opacity-0 group-hover/thumb:opacity-100">
                            <i className="fa-solid fa-xmark text-[9px]"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center px-4 py-6 h-full">
                      <i className="fa-regular fa-images text-3xl text-gray-200 mb-2"></i>
                      <span className="text-gray-300 text-[11px]">{tr('Uploaded files appear here', 'Dito lalabas ang mga na-upload na file')}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-start gap-3 p-3 bg-gray-50 rounded-[12px]">
                  <i className="fa-solid fa-circle-info text-gray-400 mt-0.5 text-sm flex-shrink-0"></i>
                  <p className="text-[12px] text-gray-500 leading-relaxed">{tr('Always upload a clean, legible copy for faster verification.', 'Laging mag-upload ng malinis at nababasang kopya para mas mabilis ang verification.')}</p>
                </div>
              </div>

            </div>

            {/* ── Customer Validation Form ── */}
            <div className="ca-anim ca-up bg-white rounded-[15px] border border-gray-100 p-8 md:p-12 shadow-sm">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-1">{tr('Customer Information', 'Impormasyon ng Customer')}</h2>
                <p className="text-gray-400 text-[13px]">{tr('Please provide accurate information so our pharmacists can process your order.', 'Pakibigay ang tamang impormasyon para ma-process ng aming pharmacist ang inyong order.')}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Patient full name + Upload valid ID — side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <label className="text-[14px] font-semibold text-gray-700">{tr('Patient Full Name', 'Buong Pangalan ng Pasyente')}</label>
                    <input type="text" placeholder={tr('Full name as shown on the prescription', 'Buong pangalan gaya ng nasa reseta')}
                      required
                      value={formData.patientName}
                      onChange={e => setFormData(prev => ({ ...prev, patientName: e.target.value }))}
                      className="w-full bg-gray-50 border-none rounded-[15px] px-6 py-3.5 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                  </div>

                  {/* Upload valid ID of the patient */}
                  <div className="space-y-2">
                    <label className="text-[14px] font-semibold text-gray-700">{tr('Upload valid ID of the patient', 'Mag-upload ng valid ID ng pasyente')}</label>
                    <p className="text-[12px] text-gray-400 leading-relaxed">
                      {tr('Upload a valid government-issued ID of the patient. This helps us process your order faster and ensures the prescription is dispensed to the right person.', 'Mag-upload ng valid na government-issued ID ng pasyente. Makakatulong ito para mas mabilis ma-process ang order at masigurong maibibigay ang gamot sa tamang tao.')}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap pt-1">
                      {!patientIdFile ? (
                        <label className="cursor-pointer inline-flex items-center gap-2 hover:opacity-90 text-white text-[13px] font-semibold px-5 py-2.5 rounded-[10px] transition"
                          style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)' }}>
                          <input type="file" accept={ALLOWED_FILE_TYPES_ACCEPT} className="hidden" onChange={handlePatientIdChange} />
                          <i className="fa-solid fa-upload text-[11px]"></i>
                          {tr('Upload File', 'Mag-upload ng File')}
                        </label>
                      ) : (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-[10px] pl-1.5 pr-3 py-1.5">
                          {patientIdFile.type.startsWith('image/') ? (
                            <button type="button" onClick={() => setViewingFileUrl(URL.createObjectURL(patientIdFile))}
                              className="w-8 h-8 rounded-[7px] overflow-hidden border border-gray-100 flex-shrink-0">
                              <img src={URL.createObjectURL(patientIdFile)} alt={patientIdFile.name} className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <i className="fa-solid fa-file-pdf text-red-400"></i>
                          )}
                          <span className="text-[12px] text-gray-600 truncate max-w-[160px]">{patientIdFile.name}</span>
                          <button type="button" onClick={() => setPatientIdFile(null)}
                            className="text-gray-400 hover:text-red-500 transition">
                            <i className="fa-solid fa-xmark text-[11px]"></i>
                          </button>
                        </div>
                      )}
                      <span className="text-[11px] text-gray-400">{tr('Accepted formats: JPG, PNG, PDF', 'Tinatanggap na format: JPG, PNG, PDF')}</span>
                    </div>
                  </div>
                </div>

                {/* Contact Person */}
                <div className="border border-gray-100 rounded-[15px] p-6 bg-gray-50/40 space-y-4">
                  <h3 className="text-[15px] font-semibold text-gray-800">{tr('Contact Person', 'Contact Person')}</h3>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={contactSameAsPatient}
                      onChange={e => setContactSameAsPatient(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded-md border-gray-200 text-success focus:ring-success cursor-pointer" />
                    <span>
                      <span className="block text-[13px] font-semibold text-gray-700">{tr('Same as patient details', 'Kapareho ng detalye ng pasyente')}</span>
                      <span className="block text-[12px] text-gray-400 mt-0.5">{tr('Check this box if the patient is the one placing the order and receiving delivery.', 'I-check ito kung ang pasyente mismo ang nag-o-order at tatanggap ng delivery.')}</span>
                    </span>
                  </label>

                  {!contactSameAsPatient && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-2">
                      <div className="space-y-2">
                        <label className="text-[14px] font-semibold text-gray-700">{tr("Contact Person's Full Name", 'Buong Pangalan ng Contact Person')}</label>
                        <input type="text" placeholder={tr('Person we should contact', 'Taong dapat naming kontakin')}
                          required={!contactSameAsPatient}
                          value={formData.contactName}
                          onChange={e => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                          className="w-full bg-white border-none rounded-[15px] px-6 py-3.5 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[14px] font-semibold text-gray-700">{tr('Relationship to Patient', 'Kaugnayan sa Pasyente')}</label>
                        <select
                          value={formData.contactRelationship}
                          onChange={e => setFormData(prev => ({ ...prev, contactRelationship: e.target.value }))}
                          className="w-full bg-white border-none rounded-[15px] px-6 py-3.5 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition">
                          <option value="">{tr('Select relationship (optional)', 'Pumili ng kaugnayan (opsyonal)')}</option>
                          <option value="Family member">{tr('Family member', 'Kapamilya')}</option>
                          <option value="Caregiver">{tr('Caregiver', 'Tagapag-alaga')}</option>
                          <option value="Guardian">{tr('Guardian', 'Guardian')}</option>
                          <option value="Healthcare professional">{tr('Healthcare professional', 'Healthcare professional')}</option>
                          <option value="Other">{tr('Other', 'Iba pa')}</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Remaining fields — Email/Age, Phone/Delivery address */}


                <div className="mb-8">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-1">{tr('Contact & Delivery', 'Contact at Delivery')}</h2>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <label className="text-[14px] font-semibold text-gray-700">{tr('Email Address', 'Email Address')}</label>
                    <input type="email" placeholder="example@domain.com"
                      required
                      value={formData.email}
                      onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full bg-gray-50 border-none rounded-[15px] px-6 py-3.5 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                  </div>

                  {/* Age — right of Email, same size as the other fields */}
                  <div className="space-y-2" ref={ageDropdownRef}>
                    <label className="text-[14px] font-semibold text-gray-700">{tr('Age', 'Edad')}</label>
                    <div className="relative">
                      <button type="button"
                        onClick={() => setAgeDropdownOpen(o => !o)}
                        className="w-full flex items-center justify-between bg-gray-50 rounded-[15px] px-6 py-3.5 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition cursor-pointer">
                        <span className={formData.age ? 'text-gray-700' : 'text-gray-300'}>{formData.age || tr('Age', 'Edad')}</span>
                        <i className="fa-solid fa-chevron-down text-[10px] text-gray-400"></i>
                      </button>
                      {ageDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-[12px] shadow-xl border border-gray-100 z-[60] overflow-hidden">
                          <div className="max-h-48 overflow-y-auto">
                            {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                              <button key={age} type="button"
                                onClick={() => { setFormData(prev => ({ ...prev, age: String(age) })); setAgeDropdownOpen(false); }}
                                className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-50 transition ${formData.age === String(age) ? 'bg-green-50 text-[#61A644] font-semibold' : 'text-gray-700'}`}>
                                {age}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Phone number — under Email */}
                  <div className="space-y-2">
                    <label className="text-[14px] font-semibold text-gray-700">{tr('Phone Number', 'Phone Number')}</label>
                    <div className="relative flex items-center bg-gray-50 rounded-[15px] overflow-visible focus-within:ring-2 focus-within:ring-primary/20 transition">
                      <button type="button" onClick={() => setPhoneCountryOpen(o => !o)}
                        className="flex items-center gap-1.5 pl-4 pr-2 py-3.5 shrink-0 border-r border-gray-200 text-[13px] text-gray-700 hover:bg-gray-100 rounded-l-[15px] transition">
                        <span>{phoneCountry.flag}</span>
                        <span className="font-semibold text-gray-600">{phoneCountry.code}</span>
                        <i className="fa-solid fa-chevron-down text-[9px] text-gray-400"></i>
                      </button>
                      <input ref={phoneInputRef} type="tel" required
                        placeholder={(() => { const d = '9123456789'; let i = 0; return phoneCountry.mask.replace(/#/g, () => d[i++ % d.length]); })()}
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        className="flex-1 min-w-0 bg-transparent px-4 py-3.5 text-[13px] text-gray-700 outline-none placeholder-gray-300" />
                      {phoneCountryOpen && (
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-[12px] shadow-xl border border-gray-100 z-[60] overflow-hidden" onClick={e => e.stopPropagation()}>
                          <div className="p-2 border-b border-gray-100">
                            <input autoFocus type="text" placeholder={tr('Search country...', 'Maghanap ng bansa...')}
                              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
                              className="w-full px-3 py-2 text-[12px] bg-gray-50 rounded-[8px] outline-none placeholder-gray-300 text-gray-700" />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {PHONE_COUNTRIES.filter(c =>
                              c.name.toLowerCase().includes(phoneSearch.toLowerCase()) || c.code.includes(phoneSearch)
                            ).map(c => (
                              <button key={c.code + c.name} type="button"
                                onClick={() => { setPhoneCountry(c); setPhoneCountryOpen(false); setPhoneSearch(''); setFormData(prev => ({ ...prev, phone: '' })); }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition text-[13px] ${phoneCountry.code === c.code && phoneCountry.name === c.name ? 'bg-green-50 text-[#61A644] font-semibold' : 'text-gray-700'}`}>
                                <span className="text-base">{c.flag}</span>
                                <span className="flex-1">{c.name}</span>
                                <span className="text-gray-400 text-[12px]">{c.code}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delivery address — under Age */}
                  <div className="space-y-2">
                    <label className="text-[14px] font-semibold text-gray-700">{tr('Delivery Address', 'Address para sa Delivery')}</label>
                    <input type="text" placeholder={tr('Complete address for courier delivery', 'Kumpletong address para sa courier delivery')}
                      required
                      value={formData.address}
                      onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full bg-gray-50 border-none rounded-[15px] px-6 py-3.5 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                  </div>
                </div>

                {/* After-submit note */}
                <div className="flex items-start gap-2 text-[12px] text-gray-400 pt-2">
                  <i className="fa-solid fa-circle-info mt-0.5 flex-shrink-0"></i>
                  <span>{tr('Our pharmacists will contact you on the mobile number provided.', 'Kokontakin kayo ng aming pharmacist sa ibinigay na mobile number.')}</span>
                </div>

                <hr className="border-gray-100" />

                <div>
                  <h3 className="text-[15px] font-semibold text-gray-800 mb-3">{tr('Declarations and Consent', 'Mga Deklarasyon at Pahintulot')}</h3>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-3 max-w-xl">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" id="terms"
                          checked={formData.terms}
                          onChange={e => setFormData(prev => ({ ...prev, terms: e.target.checked }))}
                          className="w-4 h-4 mt-0.5 rounded-md border-gray-200 text-success focus:ring-success cursor-pointer" />
                        <label htmlFor="terms" className="text-[12px] text-gray-500 cursor-pointer">
                          {tr('I confirm that the information provided is accurate and that the prescription submitted is valid.', 'Kinukumpirma kong tama ang ibinigay na impormasyon at valid ang ipinadalang reseta.')}
                        </label>
                      </div>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" id="privacyConsent"
                          checked={formData.privacyConsent}
                          onChange={e => setFormData(prev => ({ ...prev, privacyConsent: e.target.checked }))}
                          className="w-4 h-4 mt-0.5 rounded-md border-gray-200 text-success focus:ring-success cursor-pointer" />
                        <label htmlFor="privacyConsent" className="text-[12px] text-gray-500 cursor-pointer">
                          {tr('I have read and understood the', 'Nabasa at naintindihan ko ang')}{' '}
                          <button type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              // The modal lived in the Vite footer.html; the Next.js Footer
                              // does not render it, so fall back to the policy page in a new
                              // tab (keeps this half-filled form intact).
                              const modal = document.getElementById('privacy-policy-modal');
                              if (modal) modal.classList.remove('hidden');
                              else window.open('/privacy-policy', '_blank', 'noopener');
                            }}
                            className="text-primary font-semibold hover:underline">
                            Privacy Policy
                          </button>
                          {' '}{tr('and consent to the collection, use, and processing of my personal and sensitive personal information for the purpose of verifying, processing, dispensing, and delivering my order.', 'at pumapayag ako sa pagkolekta, paggamit at pagproseso ng aking personal at sensitibong personal na impormasyon para sa pag-verify, pagproseso, pag-dispense at pag-deliver ng aking order.')}
                        </label>
                      </div>
                    </div>

                    <Turnstile turnstile={orderTurnstile} className="w-full" />

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button type="button"
                        onClick={() => {
                          setFormData({ patientName: '', email: '', phone: '', age: '', dob: '', address: '', contactName: '', contactRelationship: '', terms: false, privacyConsent: false });
                          setUploadedFiles([]);
                          setUploadComplete(false);
                          setPatientIdFile(null);
                          setContactSameAsPatient(false);
                        }}
                        className="shadow-none px-5 py-2 rounded-[15px] text-[13px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                        {tr('Cancel', 'Kanselahin')}
                      </button>
                      <button type="submit" disabled={submitState === 'sending' || (orderTurnstile.enabled && !orderTurnstile.token)}
                        className="shadow-none hover:opacity-90 text-white font-bold py-2 px-6 rounded-[15px] text-[13px] transition disabled:opacity-50"
                        style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)' }}>
                        {submitState === 'sending' ? tr('Submitting...', 'Ipinapadala...') : tr('Submit', 'Ipadala')}
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Medical Disclaimer */}
              <div className="mt-8 p-5 bg-amber-50 border border-amber-100 rounded-[15px] flex items-start gap-3">
                <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 flex-shrink-0"></i>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  <span className="font-bold">{tr('Medical Disclaimer: ', 'Medical Disclaimer: ')}</span>
                  {tr('Getmeds dispenses prescription medicines only upon receipt of a valid prescription from a licensed physician. This service does not replace professional medical advice, diagnosis, or treatment. Always consult your healthcare provider for any medical concerns.', 'Nagbibigay lang ang Getmeds ng mga gamot na may reseta kapag may valid na reseta mula sa lisensyadong doktor. Hindi pumapalit ang serbisyong ito sa propesyonal na payo, diagnosis o gamutan ng doktor. Laging kumonsulta sa inyong healthcare provider para sa anumang medikal na alalahanin.')}
                </p>
              </div>
            </div>
            </>
            )}

            {/* Doctor / Pharmacy Owner — generic inquiry form, no product context yet.
                Wide/landscape card spanning the full content width: short fields share a row,
                Message spans full width below, and the submit button sits bottom-right.
                Hospitals get their own procurement form below instead. */}
            {isProfessionalUserType && !isPartnerUserType && (
              <div className="ca-anim ca-up bg-white rounded-[15px] border border-gray-100 p-6 md:p-10 shadow-sm">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-1">{tr('Send an Inquiry', 'Magpadala ng Inquiry')}</h2>
                    <p className="text-gray-400 text-[13px]">{tr('Submit your details and our team will follow up with a formal response.', 'Ipadala ang inyong detalye at magfo-follow up ang aming team ng pormal na sagot.')}</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-primary border border-blue-100 shrink-0">
                    <i className="fa-solid fa-user-tag text-[9px]"></i>
                    {USER_TYPE_DISPLAY_LABELS[orderUserType]}
                  </div>
                </div>

                <form onSubmit={handleInquirySubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{tr('Full Name', 'Buong Pangalan')}</label>
                      <input type="text" required placeholder={tr('John Doe', 'Juan Dela Cruz')}
                        value={inquiryFormData.name}
                        onChange={e => setInquiryFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{tr('Email Address', 'Email Address')}</label>
                      <input type="email" required placeholder="example@domain.com"
                        value={inquiryFormData.email}
                        onChange={e => setInquiryFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{tr('Phone Number', 'Phone Number')}</label>
                      <input type="tel" required placeholder="+63 900 000 0000"
                        inputMode="numeric"
                        value={inquiryFormData.phone}
                        onChange={e => setInquiryFormData(prev => ({ ...prev, phone: e.target.value.replace(/[^\d+\s\-()]/g, '') }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2" ref={inquiryAgeDropdownRef}>
                      <label className="text-[13px] font-semibold text-gray-700">{tr('Age', 'Edad')}</label>
                      <div className="relative">
                        <button type="button"
                          onClick={() => setInquiryAgeDropdownOpen(o => !o)}
                          className="w-full flex items-center justify-between bg-gray-50 rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition cursor-pointer">
                          <span className={inquiryFormData.age ? 'text-gray-700' : 'text-gray-300'}>{inquiryFormData.age || tr('Age', 'Edad')}</span>
                          <i className="fa-solid fa-chevron-down text-[10px] text-gray-400"></i>
                        </button>
                        {inquiryAgeDropdownOpen && (
                          <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-[12px] shadow-xl border border-gray-100 z-[60] overflow-hidden">
                            <div className="max-h-48 overflow-y-auto">
                              {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                                <button key={age} type="button"
                                  onClick={() => { setInquiryFormData(prev => ({ ...prev, age: String(age) })); setInquiryAgeDropdownOpen(false); }}
                                  className={`w-full text-left px-4 py-2 text-[13px] hover:bg-gray-50 transition ${inquiryFormData.age === String(age) ? 'bg-green-50 text-[#61A644] font-semibold' : 'text-gray-700'}`}>
                                  {age}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] font-semibold text-gray-700">{tr('Message', 'Mensahe')}</label>
                    <textarea rows={3} placeholder={tr('Tell us more about your requirements...', 'Sabihin sa amin ang higit pa tungkol sa inyong mga kailangan...')}
                      value={inquiryFormData.message}
                      onChange={e => setInquiryFormData(prev => ({ ...prev, message: e.target.value }))}
                      className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300 resize-none" />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <Turnstile turnstile={inquiryTurnstile} className="min-h-[65px] flex justify-start" />
                    <button type="submit" disabled={inquirySubmitState === 'sending' || (inquiryTurnstile.enabled && !inquiryTurnstile.token)}
                      className="text-white font-bold py-3 px-10 rounded-[12px] transition-all duration-300 text-[13px] disabled:opacity-50 whitespace-nowrap"
                      style={{ background: 'linear-gradient(to right, #61A644, #0D99FF)' }}>
                      {inquirySubmitState === 'sending'
                        ? tr('Sending...', 'Ipinapadala...')
                        : inquirySubmitState === 'error'
                          ? tr('Failed to submit. Try again.', 'Hindi naipadala. Subukan ulit.')
                          : tr('Submit Inquiry Request', 'Ipadala ang Inquiry Request')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Hospital and pharmacy partners — same eight fields and submit path,
                different copy and destination sheet (see PARTNER_FORM /
                PARTNER_INQUIRY_TYPE). Separate from the generic professional form,
                which doesn't carry organisation, role or location. */}
            {isPartnerUserType && (
              <>
              {/* Onboarding steps — pharmacy partners only */}
              {isPharmacyUserType && (
                <div className="ca-anim ca-up bg-white rounded-[15px] border border-gray-100 p-6 md:p-10 shadow-sm">
                  <h2 className="text-xl font-semibold text-gray-900 mb-1.5">{tr('How Partnership Works', 'Paano Gumagana ang Partnership')}</h2>
                  <p className="text-gray-900 text-[15px] leading-relaxed mb-6">
                    {tr('We are dedicated to providing all documents needed, competitive pricing, and fast dispatch and distribution — from onboarding to your first order.', 'Ibinibigay namin ang lahat ng kailangang dokumento, abot-kayang presyo, at mabilis na dispatch at distribution — mula onboarding hanggang sa inyong unang order.')}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {PARTNERSHIP_STEPS.map((step, i) => (
                      <div key={step.title} className="rounded-[14px] bg-gray-50 p-5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold mb-3"
                          style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)' }}>
                          {i + 1}
                        </div>
                        <h3 className="text-[14px] font-semibold text-dark mb-1">{step.title}</h3>
                        <p className="text-[12.5px] text-gray-400 leading-relaxed">{step.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="ca-anim ca-up bg-white rounded-[15px] border border-gray-100 p-6 md:p-10 shadow-sm">
                <div className="mb-6">
                  <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
                    <h2 className="text-xl font-semibold text-gray-900">{PARTNER_FORM.heading}</h2>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-primary border border-blue-100 shrink-0">
                      <i className={`fa-solid ${PARTNER_FORM.badgeIcon} text-[9px]`}></i>
                      {PARTNER_FORM.badgeLabel}
                    </div>
                  </div>
                  <p className="text-gray-900 text-[15px]">{PARTNER_FORM.subtitle}</p>
                </div>

                <form onSubmit={handlePartnerSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{tr('Full Name', 'Buong Pangalan')}</label>
                      <input type="text" required placeholder={PARTNER_FORM.namePlaceholder}
                        value={partnerFormData.name}
                        onChange={e => setPartnerFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{PARTNER_FORM.positionLabel}</label>
                      <input type="text" required placeholder={PARTNER_FORM.positionPlaceholder}
                        value={partnerFormData.position}
                        onChange={e => setPartnerFormData(prev => ({ ...prev, position: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    {PARTNER_FORM.showPrcLicense && (
                      <div className="space-y-2">
                        <label className="text-[13px] font-semibold text-gray-700">{tr('PRC License Number', 'Numero ng PRC License')}</label>
                        <input type="text" required placeholder={PARTNER_FORM.prcPlaceholder}
                          inputMode="numeric"
                          value={partnerFormData.prcLicense}
                          onChange={e => setPartnerFormData(prev => ({ ...prev, prcLicense: e.target.value }))}
                          className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{PARTNER_FORM.orgLabel}</label>
                      <input type="text" required placeholder={PARTNER_FORM.orgPlaceholder}
                        value={partnerFormData.institution}
                        onChange={e => setPartnerFormData(prev => ({ ...prev, institution: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{tr('Location / City', 'Lokasyon / Lungsod')}</label>
                      <input type="text" required placeholder={PARTNER_FORM.locationPlaceholder}
                        value={partnerFormData.location}
                        onChange={e => setPartnerFormData(prev => ({ ...prev, location: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-gray-700">{PARTNER_FORM.emailLabel}</label>
                      <input type="email" required placeholder={PARTNER_FORM.emailPlaceholder}
                        value={partnerFormData.email}
                        onChange={e => setPartnerFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="hospital-phone" className="text-[13px] font-semibold text-gray-700">{tr('Phone / Mobile Number', 'Phone / Mobile Number')}</label>
                      <div className="gcb-phone-wrap">
                        <input type="tel" id="hospital-phone" name="phone" required
                          ref={partnerPhoneRef}
                          placeholder={tr('e.g. 912 345 6789', 'hal. 912 345 6789')}
                          autoComplete="tel"
                          inputMode="numeric"
                          onInput={() => { if (partnerPhoneError) setPartnerPhoneError(''); }}
                          className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300" />
                      </div>
                      {partnerPhoneError && (
                        <p className="text-[12px] text-red-500">{partnerPhoneError}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] font-semibold text-gray-700">{tr('Message', 'Mensahe')}</label>
                    <textarea rows={3} placeholder={PARTNER_FORM.messagePlaceholder}
                      value={partnerFormData.message}
                      onChange={e => setPartnerFormData(prev => ({ ...prev, message: e.target.value }))}
                      className="w-full bg-gray-50 border-none rounded-[12px] px-4 py-3 text-[13px] text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition placeholder-gray-300 resize-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[13px] font-semibold text-gray-700">{tr('Consent', 'Pahintulot')}</label>
                    <label className="flex items-start gap-3 cursor-pointer bg-gray-50 rounded-[12px] px-4 py-3">
                      <input type="checkbox" required
                        checked={partnerFormData.consent}
                        onChange={e => setPartnerFormData(prev => ({ ...prev, consent: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#1D9FDA]" />
                      <span className="text-[12px] leading-relaxed text-gray-500">
                        {PARTNER_FORM.consent}
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    {/* Renders only when VITE_TURNSTILE_SITE_KEY is set; without a key
                        the widget is absent and the button is never gated. */}
                    {TURNSTILE_SITE_KEY
                      ? <Turnstile turnstile={partnerTurnstile} className="min-h-[65px] flex justify-start" />
                      : <div />}
                    <button type="submit"
                      disabled={partnerSubmitState === 'sending' || (partnerTurnstile.enabled && !partnerTurnstile.token)}
                      className="text-white font-bold py-3 px-10 rounded-[12px] transition-all duration-300 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                      style={{ background: 'linear-gradient(to right, #61A644, #0D99FF)' }}>
                      {partnerSubmitState === 'sending'
                        ? tr('Sending...', 'Ipinapadala...')
                        : partnerSubmitState === 'error'
                          ? tr('Failed to submit. Try again.', 'Hindi naipadala. Subukan ulit.')
                          : tr('Submit Inquiry Request', 'Ipadala ang Inquiry Request')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Direct line for emergency/critical-care procurement, which can't wait on
                  the normal inquiry turnaround. */}
              <div className="ca-anim ca-up bg-white rounded-[15px] border border-gray-100 p-6 md:p-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
                  <div>
                    <h3 className="text-[17px] font-semibold text-gray-900 mb-1.5">{PARTNER_FORM.helpHeading}</h3>
                    <p className="text-gray-900 text-[15px] leading-relaxed">{PARTNER_FORM.helpBlurb}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">{tr('Contact Details', 'Contact Details')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                      {PARTNER_FORM.contacts.map(item => (
                        <a key={item.label} href={item.href}
                          className="group flex items-center gap-2.5 text-[13px] font-semibold text-gray-700 hover:text-primary transition">
                          <span className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <i className={`fa-solid ${item.icon} text-[10px] text-primary`}></i>
                          </span>
                          <span className="truncate">{item.label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}

            {/* ── Support & Trust (patient / doctor / pharmacy) ── */}
            {!isPartnerUserType && (
            <div className="ca-anim ca-up">

              {/* Top row — shorter details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

                {/* Need Assistance */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">{tr('Need Assistance?', 'Kailangan ng Tulong?')}</p>
                  <p className="text-[15px] font-semibold mb-4"
                    style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {tr('Chat with our pharmacist', 'Makipag-chat sa aming pharmacist')}
                  </p>
                  <div className="mt-auto space-y-3">
                    <a href="tel:+639190769105" className="flex items-center gap-3 group">
                      <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-dark text-xs group-hover:bg-primary group-hover:text-white transition shadow-sm flex-shrink-0">
                        <i className="fa-solid fa-phone"></i>
                      </div>
                      <div>
                        <p className="text-[13px] text-gray-400 font-medium">{tr('Customer Support', 'Customer Support')}</p>
                        <p className="text-[15px] font-semibold text-dark">+639190769105</p>
                      </div>
                    </a>
                    <a href="mailto:info@getmeds.ph" className="flex items-center gap-3 group">
                      <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-dark text-xs group-hover:bg-primary group-hover:text-white transition shadow-sm flex-shrink-0">
                        <i className="fa-solid fa-envelope"></i>
                      </div>
                      <div>
                        <p className="text-[13px] text-gray-400 font-medium">{tr('Email Address', 'Email Address')}</p>
                        <p className="text-[15px] font-semibold text-dark">info@getmeds.ph</p>
                      </div>
                    </a>
                  </div>
                </div>

                {/* Secure Prescription Storage */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
                  <div className="w-11 h-11 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 shadow-sm mb-4">
                    <i className="fa-solid fa-lock text-lg"></i>
                  </div>
                  <h3 className="text-[15px] font-semibold text-dark mb-1">{tr('Secure prescription storage', 'Ligtas na pag-iimbak ng reseta')}</h3>
                  <p className="text-[13px] text-gray-400 leading-relaxed">{tr('All uploads are encrypted and handled with strict confidentiality.', 'Naka-encrypt ang lahat ng upload at mahigpit na kumpidensyal.')}</p>
                </div>

                {/* Patient Privacy Commitment */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
                  <div className="w-11 h-11 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 shadow-sm mb-4">
                    <i className="fa-solid fa-shield-halved text-lg"></i>
                  </div>
                  <h3 className="text-[15px] font-semibold text-dark mb-1">{tr('Patient Privacy Commitment', 'Pangako sa Privacy ng Pasyente')}</h3>
                  <p className="text-[13px] text-gray-400 leading-relaxed">
                    {tr('Personal and prescription information is handled with care, in line with Philippine Data Privacy Act principles.', 'Maingat na pinangangasiwaan ang personal na impormasyon at reseta, alinsunod sa mga prinsipyo ng Philippine Data Privacy Act.')}
                  </p>
                </div>
              </div>

              {/* Bottom row — longest details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Licensed Pharmacy Operations */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                  <div className="w-11 h-11 rounded-[12px] bg-green-50 flex items-center justify-center text-green-600 flex-shrink-0">
                    <i className="fa-solid fa-certificate text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-dark mb-1">{tr('Licensed Pharmacy Operations', 'Lisensyadong Operasyon ng Botika')}</h3>
                    <p className="text-[13px] font-semibold text-gray-500 leading-relaxed">{tr('FDA Philippines Licensed', 'Lisensyado ng FDA Philippines')}</p>
                    <p className="text-[13px] text-gray-400 leading-relaxed">{tr('Operating under valid Food and Drug Administration of the Philippines licenses as a wholesaler, distributor, and retail pharmacy.', 'Nag-o-operate sa ilalim ng valid na lisensya ng Food and Drug Administration of the Philippines bilang wholesaler, distributor at retail pharmacy.')}</p>
                  </div>
                </div>

                {/* Pharmacist-Verified Dispensing */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                  <div className="w-11 h-11 rounded-[12px] bg-green-50 flex items-center justify-center text-green-600 flex-shrink-0">
                    <i className="fa-solid fa-user-doctor text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-dark mb-1">{tr('Pharmacist-Verified Dispensing', 'Dispensing na Beripikado ng Pharmacist')}</h3>
                    <p className="text-[13px] text-gray-400 leading-relaxed">
                      {tr('All medications reviewed and dispensed under the supervision of PRC-licensed Filipino pharmacists, in accordance with the Philippine Pharmacy Act (RA 10918).', 'Lahat ng gamot ay sinusuri at ibinibigay sa ilalim ng pangangasiwa ng mga Pilipinong pharmacist na may PRC license, alinsunod sa Philippine Pharmacy Act (RA 10918).')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* ── Hospital: supplier credentials, therapeutic areas, CSP ── */}
            {isPartnerUserType && (
              <div className="ca-anim ca-up space-y-4">

                {/* Supplier / distributor credentials */}
                <div>
                  {/* The title is the grid's first cell (spanning all but one column),
                      so the opening credential card sits beside it and the remaining
                      six flow underneath without leaving a hole in the layout. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <h2 className={`${PARTNER_TRUST.credentialsTitleSpan} self-center p-6 text-2xl md:text-[26px] font-semibold text-gray-900 leading-snug`} style={{ textWrap: "balance" }}>
                      {PARTNER_TRUST.credentialsHeading}
                    </h2>
                    {PARTNER_TRUST.credentials.map(item => (
                      <div key={item.title} className="rounded-2xl p-6 flex flex-col">
                        <item.Icon className="w-9 h-9 text-green-600 mb-4" strokeWidth={1.5} aria-hidden="true" />
                        <h3 className="text-[15px] font-semibold text-dark mb-1">{item.title}</h3>
                        <p className="text-[13px] text-gray-400 leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Therapeutic areas */}
                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100">
                  <h2 className="text-xl font-semibold text-gray-900 mb-1.5">{tr('Our Therapeutic Areas', 'Ang Aming mga Therapeutic Area')}</h2>
                  <p className="text-[15px] text-gray-900 leading-relaxed mb-6">{PARTNER_TRUST.therapeuticIntro}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {THERAPEUTIC_AREAS.map(area => (
                      <div key={area.name} className="flex items-start gap-3.5 rounded-[14px] bg-gray-50 p-4">
                        <div className="w-9 h-9 rounded-[10px] bg-white flex items-center justify-center text-green-600 shadow-sm flex-shrink-0">
                          <i className={`fa-solid ${area.icon} text-[13px]`}></i>
                        </div>
                        <div>
                          <h3 className="text-[14px] font-semibold text-dark mb-0.5">{area.name}</h3>
                          <p className="text-[12.5px] text-gray-400 leading-relaxed">{area.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[13px] text-gray-500 leading-relaxed mt-6">
                    {tr('Looking for a specific product or molecule? Let us know in your inquiry, and our team will confirm availability and next steps.', 'May hinahanap na partikular na produkto o molecule? Sabihin sa inyong inquiry, at kukumpirmahin ng aming team ang availability at susunod na hakbang.')}
                  </p>
                </div>

                {/* Areas We Serve — pharmacy partners only */}
                {isPharmacyUserType && (
                  <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 mb-1.5">{tr('Areas We Serve', 'Mga Lugar na Aming Sineserbisyuhan')}</h2>
                    <p className="text-[15px] text-gray-900 leading-relaxed">{PARTNER_TRUST.areasWeServe}</p>
                  </div>
                )}

                {/* Compassionate Special Permit — hospital and doctor partners */}
                {PARTNER_TRUST.showCsp && (
                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100">
                  <h2 className="text-xl font-semibold text-gray-900 mb-1.5">Compassionate Special Permit (CSP)</h2>
                  <p className="text-[15px] text-gray-900 leading-relaxed">{PARTNER_TRUST.cspIntro}</p>

                  <p className="text-[13px] font-semibold text-dark mt-6 mb-3">{tr('Getmeds coordinates CSP applications for both:', 'Inaasikaso ng Getmeds ang CSP application para sa dalawang ito:')}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PARTNER_TRUST.cspUseTypes.map(use => (
                      <div key={use.name} className="flex items-start gap-3.5 rounded-[14px] bg-gray-50 p-4">
                        <div className="w-9 h-9 rounded-[10px] bg-white flex items-center justify-center text-green-600 shadow-sm flex-shrink-0">
                          <i className="fa-solid fa-check text-[13px]"></i>
                        </div>
                        <div>
                          <h3 className="text-[14px] font-semibold text-dark mb-0.5">{use.name}</h3>
                          <p className="text-[12.5px] text-gray-400 leading-relaxed">{use.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {PARTNER_TRUST.cspCommonUses.length > 0 ? (
                    <>
                      <p className="text-[13px] font-semibold text-dark mt-6 mb-3">{tr('This pathway is commonly used for:', 'Karaniwang ginagamit ang prosesong ito para sa:')}</p>
                      <ul className="space-y-2">
                        {PARTNER_TRUST.cspCommonUses.map(use => (
                          <li key={use} className="flex items-start gap-2.5 text-[14px] text-gray-600 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-2 shrink-0" />
                            {use}
                          </li>
                        ))}
                      </ul>

                      <p className="text-[13px] font-semibold text-dark mt-6 mb-3">{tr('How it works:', 'Paano ito gumagana:')}</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {PARTNER_TRUST.cspHowItWorks.map((step, i) => (
                          <div key={step} className="rounded-[14px] bg-gray-50 p-4">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold mb-2.5"
                              style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)' }}>
                              {i + 1}
                            </div>
                            <p className="text-[12.5px] text-gray-500 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-gray-400 leading-relaxed max-w-3xl mt-6">
                      {tr('This pathway is commonly used for rare disease treatments, oncology medicines not yet locally registered, and specialty biologics unavailable through standard channels.', 'Karaniwang ginagamit ang prosesong ito para sa gamutan ng rare disease, mga gamot sa oncology na hindi pa rehistrado dito, at specialty biologics na hindi makukuha sa karaniwang paraan.')}
                    </p>
                  )}

                  <div className="flex items-start gap-3 rounded-[14px] bg-amber-50 border border-amber-100 p-4 mt-6">
                    <i className="fa-solid fa-circle-info text-amber-500 text-[13px] mt-0.5 flex-shrink-0"></i>
                    <p className="text-[12.5px] text-amber-900 leading-relaxed">
                      <span className="font-semibold">{tr('Note:', 'Paalala:')}</span> {PARTNER_TRUST.cspNote}
                    </p>
                  </div>
                </div>
                )}

                {/* Adverse event reporting — doctors only */}
                {isDoctorUserType && (
                  <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100">
                    <div className="flex items-start gap-3 mb-1.5">
                      <TriangleAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                      <h2 className="text-xl font-semibold text-gray-900">{tr('Reporting an Adverse Event?', 'Mag-uulat ng Adverse Event?')}</h2>
                    </div>
                    <p className="text-[15px] text-gray-900 leading-relaxed mb-5">
                      {tr('If you need to report a suspected adverse drug reaction or product quality complaint, please contact:', 'Kung kailangan ninyong mag-ulat ng pinaghihinalaang adverse drug reaction o reklamo sa kalidad ng produkto, makipag-ugnayan kay:')}
                    </p>
                    <div className="rounded-[14px] bg-gray-50 p-5">
                      <p className="text-[15px] font-semibold text-dark">{ADVERSE_EVENT_CONTACT.name}</p>
                      <p className="text-[13px] text-gray-500 mb-3">{ADVERSE_EVENT_CONTACT.role}</p>
                      <p className="text-[13px] text-gray-500 leading-relaxed mb-3">{ADVERSE_EVENT_CONTACT.address}</p>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <a href={`mailto:${ADVERSE_EVENT_CONTACT.email}`}
                          className="flex items-center gap-2.5 text-[13px] font-semibold text-gray-700 hover:text-primary transition">
                          <span className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <i className="fa-solid fa-envelope text-[10px] text-primary"></i>
                          </span>
                          {ADVERSE_EVENT_CONTACT.email}
                        </a>
                        {ADVERSE_EVENT_CONTACT.phones.map(phone => (
                          <a key={phone.label} href={phone.href}
                            className="flex items-center gap-2.5 text-[13px] font-semibold text-gray-700 hover:text-primary transition">
                            <span className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                              <i className="fa-solid fa-phone text-[10px] text-primary"></i>
                            </span>
                            {phone.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Nationwide reach */}
                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100 text-center">
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">{PARTNER_TRUST.reachHeading}</h2>
                  <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-2 mb-3">
                    {PARTNER_TRUST.reachStats.map((stat, i) => (
                      <div key={stat.label} className="flex items-baseline gap-2">
                        {i > 0 && <span aria-hidden="true" className="text-[20px] text-gray-300 mr-1">&middot;</span>}
                        <span className="text-[28px] font-semibold"
                          style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                          {stat.value}
                        </span>
                        <span className="text-[17px] text-gray-900">{stat.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[15px] text-gray-900 leading-relaxed">{PARTNER_TRUST.reachBlurb}</p>
                </div>
              </div>
            )}

          </div>
        </section>
        </>)}

        {/* ── Upload Modal ── */}
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-dark/60 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: modalOpen ? 1 : 0, pointerEvents: modalOpen ? 'all' : 'none' }}
        >
          <div
            className="bg-[#1A1C1E] w-full max-w-[340px] rounded-[15px] p-8 text-center shadow-2xl relative transform transition-transform duration-300"
            style={{ transform: modalOpen ? 'scale(1)' : 'scale(0.95)' }}
          >
            <button onClick={closeUploadModal} className="absolute top-4 right-4 text-gray-500 hover:text-white transition">
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
            <div className="w-16 h-16 bg-[#5E5CE6]/20 text-[#5E5CE6] rounded-2xl flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-file-arrow-up text-3xl"></i>
            </div>
            <h3 className="text-white text-lg font-bold mb-2">{tr('Just a moment...', 'Sandali lang...')}</h3>
            <p className="text-gray-400 text-[12px] leading-relaxed mb-8 px-4">
              {tr('Your file is uploading. Please wait a few moments.', 'Ina-upload ang inyong file. Pakihintay sandali.')}
            </p>
            <div className="mb-8">
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                <div className="h-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: 'linear-gradient(to right,#61A644,#1D9FDA)' }} />
              </div>
              <div className="text-[#5E5CE6] text-sm font-bold">{progress}%</div>
            </div>
            <button onClick={closeUploadModal}
              className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-[12px] text-[13px] transition">
              {tr('Cancel', 'Kanselahin')}
            </button>
          </div>
        </div>

      </div>
      {/* ── Order Success Modal ── */}
      {successModalOpen && (
        <>
          <style>{`@keyframes checkBounce{0%{transform:scale(0);opacity:0}55%{transform:scale(1.06);opacity:1}75%{transform:scale(0.97)}100%{transform:scale(1);opacity:1}}.check-bounce{animation:checkBounce 0.8s ease-out forwards}`}</style>
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white w-full max-w-[400px] rounded-2xl shadow-2xl relative overflow-hidden">
              {/* Close button */}
              <button
                onClick={() => { setSuccessModalOpen(false); window.location.reload(); }}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>

              <div className="px-10 pt-12 pb-8 text-center">
                {/* Illustration */}
                <div className="flex justify-center mb-7">
                  <div className="check-bounce w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#61A644,#1D9FDA)' }}>
                    <i className="fa-solid fa-check text-white text-xl"></i>
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-[19px] font-semibold text-gray-900 mb-4 leading-snug">
                  {successKind === 'inquiry' ? tr('Thank you for your inquiry.', 'Salamat sa inyong inquiry.') : tr('Thank you for your order.', 'Salamat sa inyong order.')}
                </h2>

                {/* Message */}
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  {successKind === 'inquiry'
                    ? <>{tr('Our team will get back to you shortly with a formal response. For urgent concerns, please call', 'Babalikan kayo ng aming team sa lalong madaling panahon na may pormal na sagot. Para sa urgent na concern, tumawag sa')}{' '}</>
                    : <>{tr('We will contact you shortly to confirm your order details. For urgent concerns, please call', 'Kokontakin namin kayo sa lalong madaling panahon para kumpirmahin ang detalye ng order. Para sa urgent na concern, tumawag sa')}{' '}</>}
                  <a href="tel:+639190769105" className="text-[#1D9FDA] font-semibold hover:underline">
                    +63 919 076 9105
                  </a>.
                </p>
              </div>

              {/* Divider + footer */}
              <div className="border-t border-gray-100 px-10 py-4 text-center">
                <button
                  onClick={() => { setSuccessModalOpen(false); window.location.reload(); }}
                  className="text-[13px] font-semibold hover:underline"
                  style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
                >
                  {tr('Close', 'Isara')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Valid ID Required Modal — styled after the Prescription Required modal on product-detail */}
      {idRequiredModalOpen && (
        <>
          <style>{`
            @keyframes slideUpId{from{opacity:0;transform:translateY(24px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
            .id-modal-slide{animation:slideUpId 0.32s cubic-bezier(.22,1,.36,1) forwards}
          `}</style>
          <div
            className={`fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-200 ${idModalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => { setIdModalVisible(false); setTimeout(() => setIdRequiredModalOpen(false), 200); }}
          >
            <div
              className={`bg-white w-full max-w-[400px] rounded-2xl shadow-2xl relative overflow-hidden id-modal-slide transform transition-all duration-200 ${idModalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => { setIdModalVisible(false); setTimeout(() => setIdRequiredModalOpen(false), 200); }}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>

              {/* Body */}
              <div className="px-8 pt-8 pb-5 text-center">
                <div className="flex justify-center mb-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#EF4444,#F59E0B)' }}
                  >
                    <i className="fa-solid fa-id-card text-white text-xl"></i>
                  </div>
                </div>
                <h2 className="text-[19px] font-semibold text-gray-900 mb-2 leading-snug">{tr('Valid ID Required', 'Kailangan ng Valid ID')}</h2>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  {tr('Please upload a valid government-issued ID (JPG, PNG, or PDF) of the patient to help us process your order faster and ensure the prescription is dispensed to the right person.', 'Pakiupload ang valid na government-issued ID (JPG, PNG o PDF) ng pasyente para mas mabilis naming ma-process ang order at masigurong maibibigay ang gamot sa tamang tao.')}
                </p>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-8 py-3 text-center">
                <button
                  type="button"
                  onClick={() => { setIdModalVisible(false); setTimeout(() => setIdRequiredModalOpen(false), 200); }}
                  className="text-[13px] font-semibold hover:underline"
                  style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
                >
                  {tr('I Understand, Upload Now', 'Sige, Mag-upload Na')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Image Lightbox */}
      {viewingFileUrl && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setViewingFileUrl(null)}>
          <img src={viewingFileUrl} alt={tr('Prescription preview', 'Preview ng reseta')}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()} />
          <button onClick={() => setViewingFileUrl(null)}
            className="absolute top-5 right-5 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
      )}

      <AlertModal
        open={!!alertModal}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title}
        message={alertModal?.message ?? ''}
      />

    </div>
  );
}
