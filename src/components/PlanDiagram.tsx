export type PlanName = 'a' | 'b' | 'c';

/**
 * Schematic plans for the three residence types.
 *
 * Deliberately diagrammatic — outline and partitions, no dimensions, no
 * furniture. A photograph would be the same interior three times over, and a
 * detailed plan would imply a precision this placeholder data does not have.
 * A dashed outline is outdoor space.
 *
 * Inline SVG so they inherit `currentColor`, stay sharp at any size and cost
 * nothing over the network.
 */
export default function PlanDiagram({ name }: { name: PlanName }) {
  return (
    <svg
      viewBox="0 0 200 130"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'a' && (
        <>
          {/* Living and kitchen left, two bedrooms right. */}
          <rect x="12" y="12" width="176" height="106" rx="2" />
          <path d="M116 12v106M116 65h72M12 78h104" />
          {/* Balcony off the living room. */}
          <rect x="24" y="118" width="58" height="10" rx="1" strokeDasharray="4 3" />
        </>
      )}

      {name === 'b' && (
        <>
          {/* Dual aspect: living the full depth, three bedrooms stacked. */}
          <rect x="12" y="12" width="176" height="106" rx="2" />
          <path d="M92 12v106M92 47h96M92 82h96" />
          <rect x="24" y="118" width="52" height="10" rx="1" strokeDasharray="4 3" />
          <rect x="124" y="2" width="52" height="10" rx="1" strokeDasharray="4 3" />
        </>
      )}

      {name === 'c' && (
        <>
          {/* Corner unit: main block plus a wrapping terrace. */}
          <rect x="12" y="12" width="130" height="106" rx="2" />
          <path d="M78 12v106M78 47h64M78 82h64M12 70h66" />
          <rect x="150" y="34" width="38" height="62" rx="2" strokeDasharray="4 3" />
        </>
      )}
    </svg>
  );
}
