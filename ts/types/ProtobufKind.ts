import { SignalService } from '../protobuf';
import { PickEnum } from './Enums';

export type UserConfigKind = PickEnum<
  SignalService.SharedConfigMessage.Kind,
  | SignalService.SharedConfigMessage.Kind.USER_PROFILE
  | SignalService.SharedConfigMessage.Kind.CONTACTS
  | SignalService.SharedConfigMessage.Kind.USER_GROUPS
  | SignalService.SharedConfigMessage.Kind.CONVO_INFO_VOLATILE
>;

export function isUserKind(kind: SignalService.SharedConfigMessage.Kind): kind is UserConfigKind {
  const Kind = SignalService.SharedConfigMessage.Kind;
  return (
    kind === Kind.USER_PROFILE ||
    kind === Kind.CONTACTS ||
    kind === Kind.USER_GROUPS ||
    kind === Kind.CONVO_INFO_VOLATILE
  );
}
