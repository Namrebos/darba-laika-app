"use client";

import RequestForm, { type PartnerPreset } from "@/app/request/[token]/RequestForm";
import TransportRequestModal from "@/app/components/TransportRequestModal";

export type TransportRequestFormMode = "create" | "edit" | "readonly" | "summary";

type CreateProps = {
  mode: "create";
  token: string;
  initiallyValid: boolean;
  internal?: boolean;
  sourceRequestId?: number;
  partnerPreset?: PartnerPreset | null;
  testPartnerId?: number;
};

type ExistingProps = {
  mode: "edit" | "readonly" | "summary";
  requestId: number | null;
  onClose: () => void;
  onSaved?: () => void;
};

export type UnifiedTransportRequestFormProps = CreateProps | ExistingProps;

/**
 * Vienīgais publiskais pārvadājuma formas ieejas punkts.
 * Sadaļas izvēlas tikai režīmu; pašas nevar patvaļīgi mainīt rediģēšanas tiesības.
 */
export default function UnifiedTransportRequestForm(
  props: UnifiedTransportRequestFormProps,
) {
  if (props.mode === "create") {
    return (
      <RequestForm
        token={props.token}
        initiallyValid={props.initiallyValid}
        internal={props.internal}
        sourceRequestId={props.sourceRequestId}
        partnerPreset={props.partnerPreset}
        testPartnerId={props.testPartnerId}
      />
    );
  }

  return (
    <TransportRequestModal
      requestId={props.requestId}
      onClose={props.onClose}
      editable={props.mode === "edit"}
      onSaved={props.onSaved}
    />
  );
}
