export enum KeyPrefixType {
  /**
   * Used for keys which have the blinding update and aren't using blinding
   */
  unblinded = '00',
  /**
   * Used for identified users, open groups, etc
   */
  standard = '05',
  /**
   * used for participants in open groups
   */
  blinded = '15',
}
