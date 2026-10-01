import React from 'react';
import Link from 'next/link';
import {
  BadgeCheck, FileCheck, Headset, Siren, ShieldCheck, Stethoscope,
  Truck, Snowflake, MapPinned, Clock, HandHeart,
} from 'lucide-react';
import { ORDER_AUDIENCES, audiencePath } from './orderAudiences';

const TRUST_BADGES = [
  'FDA Philippines licensed',
  'DSWD & PCSO accredited',
  '20% Senior & PWD discount',
  'Cold-chain handling',
];

const DELIVERY = [
  {
    Icon: Clock,
    title: 'Same-day Metro Manila',
    desc: 'Orders confirmed before 3:00 PM are delivered the same day.',
  },
  {
    Icon: MapPinned,
    title: 'Luzon, Visayas and Mindanao',
    desc: 'We deliver across the Philippines, not only Metro Manila.',
  },
  {
    Icon: Snowflake,
    title: 'Cold-chain handling',
    desc: 'Temperature-controlled from our warehouse to your door.',
  },
  {
    Icon: Truck,
    title: 'GDP-compliant distribution',
    desc: 'Good Distribution Practice standards on every order.',
  },
];

const WHY_GETMEDS = [
  {
    Icon: BadgeCheck,
    title: 'Fully licensed pharmaceutical company',
    desc: 'FDA Philippines-licensed wholesaler, importer, distributor and retail pharmacy. PDEA-licensed S1 to S5 for controlled substances.',
  },
  {
    Icon: Stethoscope,
    title: 'Pharmacist-verified dispensing',
    desc: 'Every order is reviewed and dispensed under PRC-licensed Filipino pharmacists, under the Philippine Pharmacy Act (RA 10918).',
  },
  {
    Icon: FileCheck,
    title: 'Product documentation',
    desc: 'Certificate of Product Registration, Certificate of Analysis, product inserts and batch notifications.',
  },
  {
    Icon: Siren,
    title: 'Compassionate Special Permit coordination',
    desc: 'For medicines not registered in the Philippines, coordinated through our partner 2MG Inc. and subject to FDA approval.',
  },
  {
    Icon: Headset,
    title: '24/7 Customer Support',
    desc: 'Emergency requirements, delivery updates and order questions, at any hour including weekends and holidays.',
  },
  {
    Icon: HandHeart,
    title: 'Patient Assistance Program',
    desc: 'Accredited provider for cancer medicines and chemotherapy under DSWD, PCSO and other government medical assistance programs.',
  },
  {
    Icon: ShieldCheck,
    title: 'Secure prescription storage',
    desc: 'Uploads are encrypted and handled under the Data Privacy Act of 2012.',
  },
];

export default function OrderMedicinesHub() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="w-full px-4 md:px-6 pt-5 pb-4">
        <div
          className="relative rounded-[20px] overflow-hidden px-8 md:px-14 py-12"
          style={{ background: 'linear-gradient(135deg, #3aaf5c 0%, #1ab8c4 45%, #1a99d6 100%)' }}
        >
          <div className="absolute pointer-events-none" style={{ width: 160, height: 160, borderRadius: '50%', bottom: '-55px', left: '28%', background: 'radial-gradient(circle at 40% 35%, rgba(100,240,200,0.55), rgba(30,180,210,0.30))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.25)' }} />
          <div className="absolute pointer-events-none hidden md:block" style={{ width: 180, height: 180, borderRadius: '50%', bottom: '-70px', right: '8%', background: 'radial-gradient(circle at 42% 38%, rgba(130,230,230,0.45), rgba(60,190,210,0.22))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.22)' }} />
          <div className="absolute pointer-events-none hidden md:block" style={{ width: 85, height: 85, borderRadius: '50%', top: '-15px', right: '38%', background: 'radial-gradient(circle at 38% 32%, rgba(80,220,210,0.55), rgba(30,170,200,0.30))', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,0.22)' }} />

          <div className="relative z-10">
            <h1 className="ca-anim ca-up text-xl sm:text-2xl md:text-3xl font-semibold text-white tracking-tight leading-tight mb-2">
              Order medicines online in the Philippines
            </h1>
            <p className="ca-anim ca-up ca-d1 text-white/85 text-[12px] sm:text-[13px] font-medium max-w-3xl leading-relaxed">
              Prescription medicine delivery for patients, doctors, pharmacies and hospitals — nationwide
              across Luzon, Visayas and Mindanao.
            </p>

            <ul className="ca-anim ca-up ca-d2 flex flex-wrap gap-2 mt-6">
              {TRUST_BADGES.map((badge) => (
                <li
                  key={badge}
                  className="flex items-center gap-2 bg-white/15 border border-white/25 backdrop-blur-sm rounded-full px-3.5 py-1.5 text-white text-[11px] sm:text-[12px] font-semibold"
                >
                  <i className="fa-solid fa-circle-check text-[10px]"></i>
                  {badge}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

          {/* ── The four audiences — the whole point of this page ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ORDER_AUDIENCES.map((a, i) => (
              <Link
                key={a.slug}
                href={audiencePath(a)}
                className={`ca-anim ca-zoom ${['ca-d1', 'ca-d2', 'ca-d3', 'ca-d4'][i]} group flex flex-col overflow-hidden border border-gray-200 rounded-[15px] bg-white hover:border-primary/50 hover:shadow-lg transition-all duration-200`}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.image}
                    alt={a.imageAlt}
                    width={800}
                    height={450}
                    className="block w-full h-[132px] object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.28), rgba(0,0,0,0))' }}
                  />
                  <div
                    className="absolute -bottom-5 left-5 w-11 h-11 rounded-full flex items-center justify-center ring-4 ring-white"
                    style={{ background: 'linear-gradient(135deg,#61A644,#1D9FDA)' }}
                  >
                    <i className={`fa-solid ${a.icon} text-white text-[15px]`}></i>
                  </div>
                </div>

                <div className="flex flex-col flex-1 px-5 pt-8 pb-5">
                  <h2 className="text-[15px] font-semibold text-dark mb-1.5 leading-snug">{a.cardTitle}</h2>
                  <p className="text-[12px] text-gray-500 leading-relaxed mb-5 flex-1">{a.cardBody}</p>
                  <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-primary">
                    {a.cardCta}
                    <i className="fa-solid fa-arrow-right text-[10px] group-hover:translate-x-1 transition-transform"></i>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* ── Therapeutic areas ── */}
          <div className="ca-anim ca-up border border-gray-100 rounded-[15px] p-6 bg-gray-50/60">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Oncology · Hematology · Anesthesia · Essential medicines
            </h2>
            <p className="text-[14px] text-gray-600 leading-relaxed max-w-4xl">
              Getmeds supplies cancer and chemotherapy medicines, treatments for blood disorders, anesthesia
              and perioperative medicines, and essential hospital medicines to patients, doctors, pharmacies
              and hospitals nationwide.
            </p>
          </div>

          {/* ── Senior Citizen and PWD discounts ── */}
          <div className="ca-anim ca-up grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 border border-gray-100 rounded-[15px] p-6 flex flex-col justify-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Senior Citizen and PWD discounts</h2>
              <p className="text-[14px] text-gray-600 leading-relaxed">
                Getmeds complies with the Expanded Senior Citizens Act (RA 9994) and the Magna Carta for
                Persons with Disabilities (RA 10754). Present a valid Senior Citizen or PWD ID with your
                prescription.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
              <div className="border border-gray-100 rounded-[15px] p-5 flex flex-col justify-center">
                <div className="text-2xl font-semibold text-success leading-none mb-1.5">20% Discount</div>
                <p className="text-[12px] text-gray-500 leading-relaxed">on eligible prescription medicines</p>
              </div>
              <div className="border border-gray-100 rounded-[15px] p-5 flex flex-col justify-center">
                <div className="text-2xl font-semibold text-primary leading-none mb-1.5">VAT Exempt</div>
                <p className="text-[12px] text-gray-500 leading-relaxed">on the same eligible purchases</p>
              </div>
            </div>
          </div>

          {/* ── Nationwide delivery ── */}
          <div className="ca-anim ca-up">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Nationwide delivery</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {DELIVERY.map(({ Icon, title, desc }) => (
                <div key={title} className="border border-gray-100 rounded-[15px] p-5">
                  <Icon className="w-5 h-5 text-primary mb-3" strokeWidth={1.75} />
                  <h3 className="text-[14px] font-semibold text-dark mb-1">{title}</h3>
                  <p className="text-[12px] text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Why order from Getmeds ── */}
          <div className="ca-anim ca-up">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Why order from Getmeds</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {WHY_GETMEDS.map(({ Icon, title, desc }) => (
                <div key={title} className="border border-gray-100 rounded-[15px] p-5 flex gap-3.5">
                  <Icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                  <div>
                    <h3 className="text-[14px] font-semibold text-dark mb-1">{title}</h3>
                    <p className="text-[12px] text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>
    </>
  );
}
