export interface OtpDeliveryPayload {
  to: string;
  purpose: string;
  code: string;
  challengeId: string;
}

export interface OtpDeliveryProvider {
  deliver(payload: OtpDeliveryPayload): Promise<void>;
}

export const OTP_DELIVERY_PROVIDER = 'OTP_DELIVERY_PROVIDER';
