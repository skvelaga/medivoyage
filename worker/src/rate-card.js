// Rate card for the Medivoyage AI demo.
// Numbers pulled directly from medivoyage.health/savings and /procedures/dental-implants.
// Keep this in sync with the public site if either changes.

export const RATE_CARD = {
  procedure_id: "single-tooth-implant-crown",
  procedure_label: "Single-tooth dental implant + crown",

  us: {
    low: 5500,
    high: 7500,
    label: "US ballpark"
  },
  mx: {
    low: 1500,
    high: 2000,
    clinic: "PV Smile, Puerto Vallarta",
    label: "Medivoyage / PV Smile"
  },

  bone_graft: {
    us: { low: 1200, high: 3000 },
    mx: { low: 400,  high: 900 }
  },

  travel_estimate: {
    amount: 850,
    description: "round-trip flight + 4 nights"
  },

  trip_plan: [
    {
      visit: 1,
      days: "3-5",
      description: "Implant placement at PV Smile. Same-day temporary if appropriate."
    },
    {
      visit: 2,
      days: "2-3",
      wait_after_visit_1_months: "3-6",
      description: "Final zirconia crown placement after osseointegration."
    }
  ],

  disclaimer: "AI-generated draft. Reviewed by a partner dentist (Dr. Noel Rivas, DDS) before any plan reaches a patient. Final pricing requires a panoramic x-ray and in-clinic exam."
};

// Compute rendered cost comparison given AI flags.
export function computeCosts({ may_need_bone_graft }) {
  const card = RATE_CARD;

  const us_low_extra = may_need_bone_graft ? card.bone_graft.us.low : 0;
  const us_high_extra = may_need_bone_graft ? card.bone_graft.us.high : 0;
  const mx_low_extra = may_need_bone_graft ? card.bone_graft.mx.low : 0;
  const mx_high_extra = may_need_bone_graft ? card.bone_graft.mx.high : 0;

  const us_total_low = card.us.low + us_low_extra;
  const us_total_high = card.us.high + us_high_extra;
  const mx_total_low = card.mx.low + mx_low_extra;
  const mx_total_high = card.mx.high + mx_high_extra;

  const travel = card.travel_estimate.amount;
  const mx_total_with_travel_low = mx_total_low + travel;
  const mx_total_with_travel_high = mx_total_high + travel;

  // Net savings vs US ballpark (using midpoints for the headline).
  const us_mid = Math.round((us_total_low + us_total_high) / 2);
  const mx_mid = Math.round((mx_total_with_travel_low + mx_total_with_travel_high) / 2);
  const savings = us_mid - mx_mid;
  const savings_pct = Math.round((savings / us_mid) * 100);

  return {
    us: {
      range: `$${us_total_low.toLocaleString()}–$${us_total_high.toLocaleString()}`,
      midpoint: us_mid
    },
    mx: {
      range_clinic_only: `$${mx_total_low.toLocaleString()}–$${mx_total_high.toLocaleString()}`,
      range_with_travel: `$${mx_total_with_travel_low.toLocaleString()}–$${mx_total_with_travel_high.toLocaleString()}`,
      midpoint_with_travel: mx_mid,
      clinic: card.mx.clinic
    },
    travel: {
      amount: travel,
      description: card.travel_estimate.description
    },
    bone_graft_included: !!may_need_bone_graft,
    savings: {
      amount: savings,
      percent: savings_pct,
      formatted: `~$${savings.toLocaleString()} saved (~${savings_pct}% lower)`
    },
    trip_plan: card.trip_plan,
    disclaimer: card.disclaimer
  };
}
