import * as BetterSqlite3 from 'better-sqlite3';
import { compact, map, pick } from 'lodash';
import { ConversationAttributes } from '../../models/conversationAttributes';
import {
  CLOSED_GROUP_V2_KEY_PAIRS_TABLE,
  CONVERSATIONS_TABLE,
  dropFtsAndTriggers,
  GUARD_NODE_TABLE,
  jsonToObject,
  LAST_HASHES_TABLE,
  MESSAGES_TABLE,
  NODES_FOR_PUBKEY_TABLE,
  objectToJSON,
  OPEN_GROUP_ROOMS_V2_TABLE,
  rebuildFtsTable,
} from '../database_utility';

import { sqlNode } from '../sql';

// tslint:disable: no-console quotemark one-variable-per-declaration

function getSessionSchemaVersion(db: BetterSqlite3.Database) {
  const result = db
    .prepare(
      `
      SELECT MAX(version) as version FROM loki_schema;
      `
    )
    .get();
  if (!result || !result.version) {
    return 0;
  }
  return result.version;
}

function createSessionSchemaTable(db: BetterSqlite3.Database) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE loki_schema(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        version INTEGER
      );
      INSERT INTO loki_schema (
        version
      ) values (
        0
      );
      `);
  })();
}

const LOKI_SCHEMA_VERSIONS = [
  updateToSessionSchemaVersion1,
  updateToSessionSchemaVersion2,
  updateToSessionSchemaVersion3,
  updateToSessionSchemaVersion4,
  updateToSessionSchemaVersion5,
  updateToSessionSchemaVersion6,
  updateToSessionSchemaVersion7,
  updateToSessionSchemaVersion8,
  updateToSessionSchemaVersion9,
  updateToSessionSchemaVersion10,
  updateToSessionSchemaVersion11,
  updateToSessionSchemaVersion12,
  updateToSessionSchemaVersion13,
  updateToSessionSchemaVersion14,
  updateToSessionSchemaVersion15,
  updateToSessionSchemaVersion16,
  updateToSessionSchemaVersion17,
  updateToSessionSchemaVersion18,
  updateToSessionSchemaVersion19,
  updateToSessionSchemaVersion20,
  updateToSessionSchemaVersion21,
  updateToSessionSchemaVersion22,
  updateToSessionSchemaVersion23,
  updateToSessionSchemaVersion24,
  updateToSessionSchemaVersion25,
  updateToSessionSchemaVersion26,
  updateToSessionSchemaVersion27,
  updateToSessionSchemaVersion28,
  updateToSessionSchemaVersion29,
  updateToSessionSchemaVersion30,
];

function updateToSessionSchemaVersion1(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 1;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  db.transaction(() => {
    db.exec(`
      ALTER TABLE ${MESSAGES_TABLE}
      ADD COLUMN serverId INTEGER;

      CREATE TABLE servers(
        serverUrl STRING PRIMARY KEY ASC,
        token TEXT
      );
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion2(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 2;

  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE pairingAuthorisations(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        primaryDevicePubKey VARCHAR(255),
        secondaryDevicePubKey VARCHAR(255),
        isGranted BOOLEAN,
        json TEXT,
        UNIQUE(primaryDevicePubKey, secondaryDevicePubKey)
      );
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion3(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 3;

  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${GUARD_NODE_TABLE}(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        ed25519PubKey VARCHAR(64)
      );
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion4(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 4;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      DROP TABLE ${LAST_HASHES_TABLE};
      CREATE TABLE ${LAST_HASHES_TABLE}(
        id TEXT,
        snode TEXT,
        hash TEXT,
        expiresAt INTEGER,
        PRIMARY KEY (id, snode)
      );
      -- Add senderIdentity field to unprocessed needed for medium size groups
      ALTER TABLE unprocessed ADD senderIdentity TEXT;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion5(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 5;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${NODES_FOR_PUBKEY_TABLE} (
        pubkey TEXT PRIMARY KEY,
        json TEXT
      );

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion6(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 6;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      -- Remove RSS Feed conversations
      DELETE FROM ${CONVERSATIONS_TABLE} WHERE
      type = 'group' AND
      id LIKE 'rss://%';

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion7(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 7;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      -- Remove multi device data

      DELETE FROM pairingAuthorisations;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion8(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 8;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`

      ALTER TABLE ${MESSAGES_TABLE}
      ADD COLUMN serverTimestamp INTEGER;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion9(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 9;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE '__textsecure_group__!%';
      `
      )
      .all();

    const conversationIdRows = db
      .prepare(`SELECT id FROM ${CONVERSATIONS_TABLE} ORDER BY id ASC;`)
      .all();

    const allOldConversationIds = map(conversationIdRows, row => row.id);
    rows.forEach(o => {
      const oldId = o.id;
      const newId = oldId.replace('__textsecure_group__!', '');
      console.log(`migrating conversation, ${oldId} to ${newId}`);

      if (allOldConversationIds.includes(newId)) {
        console.log(
          'Found a duplicate conversation after prefix removing. We need to take care of it'
        );
        // We have another conversation with the same future name.
        // We decided to keep only the conversation with the higher number of messages
        const countMessagesOld = sqlNode.getMessagesCountByConversation(oldId, db);
        const countMessagesNew = sqlNode.getMessagesCountByConversation(newId, db);

        console.log(`countMessagesOld: ${countMessagesOld}, countMessagesNew: ${countMessagesNew}`);

        const deleteId = countMessagesOld > countMessagesNew ? newId : oldId;
        db.prepare(`DELETE FROM ${CONVERSATIONS_TABLE} WHERE id = $deleteId;`).run({ deleteId });
      }

      const morphedObject = {
        ...o,
        id: newId,
      };

      db.prepare(
        `UPDATE ${CONVERSATIONS_TABLE} SET
          id = $newId,
          json = $json
          WHERE id = $oldId;`
      ).run({
        newId,
        json: objectToJSON(morphedObject),
        oldId,
      });
    });

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion10(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 10;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${CLOSED_GROUP_V2_KEY_PAIRS_TABLE} (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        groupPublicKey TEXT,
        timestamp NUMBER,
        json TEXT
      );

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion11(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 11;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  function remove05PrefixFromStringIfNeeded(str: string) {
    if (str.length === 66 && str.startsWith('05')) {
      return str.substr(2);
    }
    return str;
  }

  db.transaction(() => {
    // the migration is called only once, so all current groups not being open groups are v1 closed group.
    const allClosedGroupV1Ids = db
      .prepare(
        `SELECT id FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id NOT LIKE 'publicChat:%';`
      )
      .all()
      .map(m => m.id) as Array<string>;

    allClosedGroupV1Ids.forEach(groupV1Id => {
      try {
        console.log('Migrating closed group v1 to v2: pubkey', groupV1Id);
        const groupV1IdentityKey = sqlNode.getIdentityKeyById(groupV1Id, db);
        if (!groupV1IdentityKey) {
          return;
        }
        const encryptionPubKeyWithoutPrefix = remove05PrefixFromStringIfNeeded(
          groupV1IdentityKey.id
        );

        // Note:
        // this is what we get from getIdentityKeyById:
        //   {
        //     id: string;
        //     secretKey?: string;
        //   }

        // and this is what we want saved in db:
        //   {
        //    publicHex: string; // without prefix
        //    privateHex: string;
        //   }
        const keyPair = {
          publicHex: encryptionPubKeyWithoutPrefix,
          privateHex: groupV1IdentityKey.secretKey,
        };
        sqlNode.addClosedGroupEncryptionKeyPair(groupV1Id, keyPair, db);
      } catch (e) {
        console.error(e);
      }
    });
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion12(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 12;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${OPEN_GROUP_ROOMS_V2_TABLE} (
        serverUrl TEXT NOT NULL,
        roomId TEXT NOT NULL,
        conversationId TEXT,
        json TEXT,
        PRIMARY KEY (serverUrl, roomId)
      );

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion13(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 13;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  // Clear any already deleted db entries.
  // secure_delete = ON will make sure next deleted entries are overwritten with 0 right away
  db.transaction(() => {
    db.pragma('secure_delete = ON');
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion14(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 14;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS servers;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS preKeys;
      DROP TABLE IF EXISTS contactPreKeys;
      DROP TABLE IF EXISTS contactSignedPreKeys;
      DROP TABLE IF EXISTS signedPreKeys;
      DROP TABLE IF EXISTS senderKeys;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion15(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 15;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        DROP TABLE pairingAuthorisations;
        DROP TRIGGER messages_on_delete;
        DROP TRIGGER messages_on_update;
      `);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion16(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 16;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN serverHash TEXT;
        ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN isDeleted BOOLEAN;

        CREATE INDEX messages_serverHash ON ${MESSAGES_TABLE} (
          serverHash
        ) WHERE serverHash IS NOT NULL;

        CREATE INDEX messages_isDeleted ON ${MESSAGES_TABLE} (
          isDeleted
        ) WHERE isDeleted IS NOT NULL;

        ALTER TABLE unprocessed ADD serverHash TEXT;
        CREATE INDEX messages_messageHash ON unprocessed (
          serverHash
        ) WHERE serverHash IS NOT NULL;
      `);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion17(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 17;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        UPDATE ${CONVERSATIONS_TABLE} SET
        json = json_set(json, '$.isApproved', 1)
      `);
    // remove the moderators field. As it was only used for opengroups a long time ago and whatever is there is probably unused
    db.exec(`
        UPDATE ${CONVERSATIONS_TABLE} SET
        json = json_remove(json, '$.moderators', '$.dataMessage', '$.accessKey', '$.profileSharing', '$.sessionRestoreSeen')
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion18(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 18;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  // Dropping all pre-existing schema relating to message searching.
  // Recreating the full text search and related triggers

  db.transaction(() => {
    dropFtsAndTriggers(db);
    rebuildFtsTable(db);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion19(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 19;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        DROP INDEX messages_schemaVersion;
        ALTER TABLE ${MESSAGES_TABLE} DROP COLUMN schemaVersion;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion20(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 20;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // First we want to drop the column friendRequestStatus if it is there, otherwise the transaction fails
    const rows = db.pragma(`table_info(${CONVERSATIONS_TABLE});`);
    if (rows.some((m: any) => m.name === 'friendRequestStatus')) {
      console.info('found column friendRequestStatus. Dropping it');
      db.exec(`ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN friendRequestStatus;`);
    }
    // looking for all private conversations, with a nickname set
    const rowsToUpdate = db
      .prepare(
        `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE type = 'private' AND (name IS NULL or name = '') AND json_extract(json, '$.nickname') <> '';`
      )
      .all();
    // tslint:disable-next-line: no-void-expression
    (rowsToUpdate || []).forEach(r => {
      const obj = jsonToObject(r.json);

      // obj.profile.displayName is the display as this user set it.
      if (obj?.nickname?.length && obj?.profile?.displayName?.length) {
        // this one has a nickname set, but name is unset, set it to the displayName in the lokiProfile if it's exisitng
        obj.name = obj.profile.displayName;
        sqlNode.saveConversation(obj as ConversationAttributes, db);
      }
    });
    writeSessionSchemaVersion(targetVersion, db);
  });
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion21(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 21;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
          UPDATE ${CONVERSATIONS_TABLE} SET
          json = json_set(json, '$.didApproveMe', 1, '$.isApproved', 1)
          WHERE type = 'private';
        `);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion22(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 22;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`DROP INDEX messages_duplicate_check;`);

    db.exec(`
      ALTER TABLE ${MESSAGES_TABLE} DROP sourceDevice;
      `);
    db.exec(`
      ALTER TABLE unprocessed DROP sourceDevice;
      `);
    db.exec(`
      CREATE INDEX messages_duplicate_check ON ${MESSAGES_TABLE} (
        source,
        sent_at
      );
      `);

    dropFtsAndTriggers(db);
    // we also want to remove the read_by it could have 20 times the same value set in the array
    // we do this once, and updated the code to not allow multiple entries in read_by as we do not care about multiple entries
    // (read_by is only used in private chats)
    db.exec(`
          UPDATE ${MESSAGES_TABLE} SET
          json = json_remove(json, '$.schemaVersion', '$.recipients', '$.decrypted_at', '$.sourceDevice', '$.read_by')
        `);
    rebuildFtsTable(db);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion23(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 23;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(
      `
        ALTER TABLE ${LAST_HASHES_TABLE} RENAME TO ${LAST_HASHES_TABLE}_old;
        CREATE TABLE ${LAST_HASHES_TABLE}(
          id TEXT,
          snode TEXT,
          hash TEXT,
          expiresAt INTEGER,
          namespace INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (id, snode, namespace)
        );`
    );

    db.exec(
      `INSERT INTO ${LAST_HASHES_TABLE}(id, snode, hash, expiresAt) SELECT id, snode, hash, expiresAt FROM ${LAST_HASHES_TABLE}_old;`
    );
    db.exec(`DROP TABLE ${LAST_HASHES_TABLE}_old;`);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

// tslint:disable-next-line: max-func-body-length
function updateToSessionSchemaVersion24(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 24;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // it's unlikely there is still a publicChat v1 convo in the db, but run this in a migration to be 100% sure (previously, run on app start instead)
    db.prepare(
      `DELETE FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE 'publicChat:1@%';`
    ).run();

    db.exec(`
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN zombies TEXT DEFAULT "[]";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN left INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN expireTimer INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN mentionedUs INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN unreadCount INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastMessageStatus TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastMessage TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastJoinedTimestamp INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN groupAdmins TEXT DEFAULT "[]";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isKickedFromGroup INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN subscriberCount INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN is_medium_group INTEGER;

         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarPointer TEXT; -- this is the url of the avatar for that conversation
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarHash TEXT; -- only used for opengroup avatar.
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN nickname TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN profileKey TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN triggerNotificationsFor TEXT DEFAULT "all";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isTrustedForAttachmentDownload INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isPinned INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isApproved INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN didApproveMe INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarInProfile TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarPathInAvatar TEXT; -- this is very temporary, removed right below
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN displayNameInProfile TEXT;

         UPDATE ${CONVERSATIONS_TABLE} SET
          zombies = json_extract(json, '$.zombies'),
          members = json_extract(json, '$.members'),
          left = json_extract(json, '$.left'),
          expireTimer = json_extract(json, '$.expireTimer'),
          mentionedUs = json_extract(json, '$.mentionedUs'),
          unreadCount = json_extract(json, '$.unreadCount'),
          lastMessageStatus = json_extract(json, '$.lastMessageStatus'),
          lastMessage = json_extract(json, '$.lastMessage'),
          lastJoinedTimestamp = json_extract(json, '$.lastJoinedTimestamp'),
          groupAdmins = json_extract(json, '$.groupAdmins'),
          isKickedFromGroup = json_extract(json, '$.isKickedFromGroup'),
          subscriberCount = json_extract(json, '$.subscriberCount'),
          is_medium_group = json_extract(json, '$.is_medium_group'),
          avatarPointer = json_extract(json, '$.avatarPointer'),
          avatarHash = json_extract(json, '$.avatarHash'),
          nickname = json_extract(json, '$.nickname'),
          profileKey = json_extract(json, '$.profileKey'),
          triggerNotificationsFor = json_extract(json, '$.triggerNotificationsFor'),
          isTrustedForAttachmentDownload = json_extract(json, '$.isTrustedForAttachmentDownload'),
          isPinned = json_extract(json, '$.isPinned'),
          isApproved = json_extract(json, '$.isApproved'),
          didApproveMe = json_extract(json, '$.didApproveMe'),
          avatarInProfile = json_extract(json, '$.profile.avatar'),-- profile.avatar is no longer used. We rely on avatarInProfile only (for private chats and opengroups )
          avatarPathInAvatar = json_extract(json, '$.avatar.path'),-- this is very temporary
          displayNameInProfile =  json_extract(json, '$.profile.displayName');

          UPDATE ${CONVERSATIONS_TABLE} SET json = json_remove(json,
              '$.zombies',
              '$.members',
              '$.left',
              '$.expireTimer',
              '$.mentionedUs',
              '$.unreadCount',
              '$.lastMessageStatus',
              '$.lastJoinedTimestamp',
              '$.lastMessage',
              '$.groupAdmins',
              '$.isKickedFromGroup',
              '$.subscriberCount',
              '$.is_medium_group',
              '$.avatarPointer',
              '$.avatarHash',
              '$.nickname',
              '$.profileKey',
              '$.triggerNotificationsFor',
              '$.isTrustedForAttachmentDownload',
              '$.isPinned',
              '$.isApproved',
              '$.type',
              '$.version',
              '$.isMe',
              '$.didApproveMe',
              '$.active_at',
              '$.id',
              '$.moderators',
              '$.sessionRestoreSeen',
              '$.profileName',
              '$.timestamp',
              '$.profile',
              '$.name',
              '$.profileAvatar',
              '$.avatarPath
          ');

          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN json;
          UPDATE ${CONVERSATIONS_TABLE} SET displayNameInProfile = name WHERE
          type = 'group' AND
          id NOT LIKE 'publicChat:%';

          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN profileName;
          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN name;

          -- we want to rely on avatarInProfile only, but it can be set either in avatarInProfile or in avatarPathInAvatar.
          -- make sure to override avatarInProfile with the value from avatarPathInAvatar if avatarInProfile is unset
          UPDATE ${CONVERSATIONS_TABLE} SET avatarInProfile = avatarPathInAvatar WHERE avatarInProfile IS NULL;
          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN avatarPathInAvatar;

          CREATE INDEX conversation_nickname ON ${CONVERSATIONS_TABLE} (
            nickname
          );
          CREATE INDEX conversation_displayNameInProfile ON ${CONVERSATIONS_TABLE} (
            displayNameInProfile
          );

         `);

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion25(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 25;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // mark all conversation as read/write/upload capability to be true on migration.
    // the next batch poll will update them if needed
    db.exec(`
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN readCapability INTEGER DEFAULT 1;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN writeCapability INTEGER DEFAULT 1;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN uploadCapability INTEGER DEFAULT 1;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN conversationIdOrigin TEXT;
          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN avatarHash;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarImageId INTEGER;

          CREATE INDEX messages_convo_serverID ON ${MESSAGES_TABLE} (
            serverId,
            conversationId
          );
         `);

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion26(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 26;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN groupModerators TEXT DEFAULT "[]"; -- those are for sogs only (for closed groups we only need the groupAdmins)
         `);

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function getRoomIdFromConversationAttributes(attributes?: ConversationAttributes | null) {
  if (!attributes) {
    return null;
  }
  const indexSemiColon = attributes.id.indexOf(':');
  const indexAt = attributes.id.indexOf('@');
  if (indexSemiColon < 0 || indexAt < 0 || indexSemiColon >= indexAt) {
    return null;
  }
  const roomId = attributes.id.substring(indexSemiColon, indexAt);
  if (roomId.length <= 0) {
    return null;
  }
  return roomId;
}

function updateToSessionSchemaVersion27(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 27;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  const domainNameToUse = 'open.getsession.org';
  const urlToUse = `https://${domainNameToUse}`;

  const ipToRemove = '116.203.70.33';

  // defining this function here as this is very specific to this migration and used in a few places
  function getNewConvoId(oldConvoId?: string) {
    if (!oldConvoId) {
      return null;
    }
    return (
      oldConvoId
        ?.replace(`https://${ipToRemove}`, urlToUse)
        // tslint:disable-next-line: no-http-string
        ?.replace(`http://${ipToRemove}`, urlToUse)
        ?.replace(ipToRemove, urlToUse)
    );
  }

  getNewConvoId('test');

  // tslint:disable-next-line: max-func-body-length
  db.transaction(() => {
    // First we want to drop the column friendRequestStatus if it is there, otherwise the transaction fails
    const rows = db.pragma(`table_info(${CONVERSATIONS_TABLE});`);
    if (rows.some((m: any) => m.name === 'friendRequestStatus')) {
      console.info('found column friendRequestStatus. Dropping it');
      db.exec(`ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN friendRequestStatus;`);
    }

    // We want to replace all the occurrences of the sogs server ip url (116.203.70.33 || http://116.203.70.33 || https://116.203.70.33) by its hostname: https://open.getsession.org
    // This includes change the conversationTable, the openGroupRooms tables and every single message associated with them.
    // Because the conversationId is used to link messages to conversation includes the ip/url in it...

    /**
     * First, remove duplicates for the v2 opengroup table, and replace the one without duplicates with their dns name syntax
     */

    // rooms to rename are: crypto, lokinet, oxen, session, session-updates
    const allSessionV2RoomsIp = sqlNode
      .getAllV2OpenGroupRooms(db)
      .filter(m => m.serverUrl.includes(ipToRemove));
    const allSessionV2RoomsDns = sqlNode
      .getAllV2OpenGroupRooms(db)
      .filter(m => m.serverUrl.includes(domainNameToUse));

    const duplicatesRoomsIpAndDns = allSessionV2RoomsIp.filter(ip =>
      allSessionV2RoomsDns.some(dns => dns.roomId === ip.roomId)
    );

    const withIpButNotDuplicateRoom = allSessionV2RoomsIp.filter(ip => {
      return !duplicatesRoomsIpAndDns.some(dns => dns.roomId === ip.roomId);
    });

    console.info(
      'allSessionV2RoomsIp',
      allSessionV2RoomsIp.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      'allSessionV2RoomsDns',
      allSessionV2RoomsDns.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      'duplicatesRoomsIpAndDns',
      duplicatesRoomsIpAndDns.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      'withIpButNotDuplicateRoom',
      withIpButNotDuplicateRoom.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      '========> before room update:',
      sqlNode
        .getAllV2OpenGroupRooms(db)
        .filter(m => m.serverUrl.includes(domainNameToUse) || m.serverUrl.includes(ipToRemove))
        .map(m => pick(m, ['conversationId', 'serverUrl', 'roomId']))
    );

    // for those with duplicates, delete the one with the IP as we want to rely on the one with the DNS only now
    // remove the ip ones completely which are duplicated.
    // Note: this also removes the ones not duplicated, but we are recreating them just below with `saveV2OpenGroupRoom`
    db.exec(`DELETE FROM ${OPEN_GROUP_ROOMS_V2_TABLE} WHERE serverUrl LIKE '%${ipToRemove}%';`);

    // for those without duplicates, override the value with the Domain Name
    withIpButNotDuplicateRoom.forEach(r => {
      const newConvoId = getNewConvoId(r.conversationId);
      if (!newConvoId) {
        return;
      }
      console.info(
        `withIpButNotDuplicateRoom: renaming room old:${r.conversationId} with saveV2OpenGroupRoom() new- conversationId:${newConvoId}: serverUrl:${urlToUse}`
      );
      sqlNode.saveV2OpenGroupRoom(
        {
          ...r,
          serverUrl: urlToUse,
          conversationId: newConvoId,
        },
        db
      );
    });

    console.info(
      '<======== after room update:',
      sqlNode
        .getAllV2OpenGroupRooms(db)
        .filter(m => m.serverUrl.includes(domainNameToUse) || m.serverUrl.includes(ipToRemove))
        .map(m => pick(m, ['conversationId', 'serverUrl', 'roomId']))
    );

    /**
     * Then, update the conversations table by doing the same thing
     */
    const allSessionV2ConvosIp = compact(
      sqlNode.getAllOpenGroupV2Conversations(db).filter(m => m?.id.includes(ipToRemove))
    );
    const allSessionV2ConvosDns = compact(
      sqlNode.getAllOpenGroupV2Conversations(db).filter(m => m?.id.includes(domainNameToUse))
    );

    const duplicatesConvosIpAndDns = allSessionV2ConvosIp.filter(ip => {
      const roomId = getRoomIdFromConversationAttributes(ip);
      if (!roomId) {
        return false;
      }
      return allSessionV2ConvosDns.some(dns => {
        return getRoomIdFromConversationAttributes(dns) === roomId;
      });
    });
    const withIpButNotDuplicateConvo = allSessionV2ConvosIp.filter(ip => {
      const roomId = getRoomIdFromConversationAttributes(ip);
      if (!roomId) {
        return false;
      }

      return !allSessionV2ConvosDns.some(dns => {
        return getRoomIdFromConversationAttributes(dns) === roomId;
      });
    });
    console.info('========================================');
    console.info(
      'allSessionV2ConvosIp',
      allSessionV2ConvosIp.map(m => m?.id)
    );
    console.info(
      'allSessionV2ConvosDns',
      allSessionV2ConvosDns.map(m => m?.id)
    );
    console.info(
      'duplicatesConvosIpAndDns',
      duplicatesConvosIpAndDns.map(m => m?.id)
    );
    console.info(
      'withIpButNotDuplicateConvo',
      withIpButNotDuplicateConvo.map(m => m?.id)
    );
    // for those with duplicates, delete the one with the IP as we want to rely on the one with the DNS only now
    // remove the ip ones completely which are duplicated.
    // Note: this also removes the ones not duplicated, but we are recreating them just below with `saveConversation`
    db.exec(`DELETE FROM ${CONVERSATIONS_TABLE} WHERE id LIKE '%${ipToRemove}%';`);

    // for those without duplicates, override the value with the DNS
    const convoIdsToMigrateFromIpToDns: Map<string, string> = new Map();
    withIpButNotDuplicateConvo.forEach(r => {
      if (!r) {
        return;
      }
      const newConvoId = getNewConvoId(r.id);
      if (!newConvoId) {
        return;
      }
      console.info(
        `withIpButNotDuplicateConvo: renaming convo old:${r.id} with saveConversation() new- conversationId:${newConvoId}`
      );
      convoIdsToMigrateFromIpToDns.set(r.id, newConvoId);
      sqlNode.saveConversation(
        {
          ...r,
          id: newConvoId,
        },
        db
      );
    });

    console.info(
      'after convos update:',
      sqlNode
        .getAllOpenGroupV2Conversations(db)
        .filter(m => m?.id.includes(domainNameToUse) || m?.id.includes(ipToRemove))
        .map(m => m?.id)
    );

    /**
     * Lastly, we need to take care of messages.
     * For duplicated rooms, we drop all the messages from the IP one. (Otherwise we would need to compare each message id to not break the PRIMARY_KEY on the messageID and those are just sogs messages).
     * For non duplicated rooms which got renamed to their dns ID, we override the stored conversationId in the message with the new conversationID
     */
    dropFtsAndTriggers(db);

    // let's start with the non duplicateD ones, as doing so will make the duplicated one process easier
    console.info('convoIdsToMigrateFromIpToDns', [...convoIdsToMigrateFromIpToDns.entries()]);
    [...convoIdsToMigrateFromIpToDns.keys()].forEach(oldConvoId => {
      const newConvoId = convoIdsToMigrateFromIpToDns.get(oldConvoId);
      if (!newConvoId) {
        return;
      }
      console.info(`About to migrate messages of ${oldConvoId} to ${newConvoId}`);

      db.prepare(
        `UPDATE ${MESSAGES_TABLE} SET
          conversationId = $newConvoId,
          json = json_set(json,'$.conversationId', $newConvoId)
          WHERE conversationId = $oldConvoId;`
      ).run({ oldConvoId, newConvoId });
    });
    // now, the duplicated ones. We just need to move every message with a convoId matching that ip, because we already took care of the one to migrate to the dns before
    console.log(
      'Count of messages to be migrated: ',
      db
        .prepare(
          `SELECT COUNT(*) FROM ${MESSAGES_TABLE} WHERE conversationId LIKE '%${ipToRemove}%';`
        )
        .get()
    );

    const messageWithIdsToUpdate = db
      .prepare(
        `SELECT DISTINCT conversationId FROM ${MESSAGES_TABLE} WHERE conversationID LIKE '%${ipToRemove}%'`
      )
      .all();
    console.info('messageWithConversationIdsToUpdate', messageWithIdsToUpdate);
    messageWithIdsToUpdate.forEach(oldConvo => {
      const newConvoId = getNewConvoId(oldConvo.conversationId);
      if (!newConvoId) {
        return;
      }
      console.info('oldConvo.conversationId', oldConvo.conversationId, newConvoId);
      db.prepare(
        `UPDATE ${MESSAGES_TABLE} SET
          conversationId = $newConvoId,
          json = json_set(json,'$.conversationId', $newConvoId)
          WHERE conversationId = $oldConvoId;`
      ).run({ oldConvoId: oldConvo.conversationId, newConvoId });
    });

    rebuildFtsTable(db);

    console.info(
      'removing lastMessageDeletedServerID & lastMessageFetchedServerID from rooms table'
    );
    db.exec(
      `UPDATE ${OPEN_GROUP_ROOMS_V2_TABLE} SET
        json = json_remove(json, '$.lastMessageDeletedServerID', '$.lastMessageFetchedServerID', '$.token' );`
    );
    console.info(
      'removing lastMessageDeletedServerID & lastMessageFetchedServerID from rooms table. done'
    );

    writeSessionSchemaVersion(targetVersion, db);
    console.log('... done');
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion28(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 28;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // Keeping this empty migration because some people updated to this already, even if it is not needed anymore
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion29(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 29;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    dropFtsAndTriggers(db);
    db.exec(`CREATE INDEX messages_unread_by_conversation ON ${MESSAGES_TABLE} (
      unread,
      conversationId
    );`);
    rebuildFtsTable(db);
    // Keeping this empty migration because some people updated to this already, even if it is not needed anymore
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion30(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 30;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // Conversation changes
    db.prepare(
      `ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN expirationType TEXT DEFAULT "off";`
    ).run();

    db.prepare(
      `ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastDisappearingMessageChangeTimestamp INTEGER DEFAULT 0;`
    ).run();

    // same value in ts/util/releaseFeature.ts but we cannot import since window doesn't exist yet.
    // TODO update to agreed value between platforms
    const featureReleaseTimestamp = 1676851200000; // unix 13/02/2023
    // support disppearing messages legacy mode until after the platform agreed timestamp
    if (Date.now() < featureReleaseTimestamp) {
      db.prepare(
        `UPDATE ${CONVERSATIONS_TABLE} SET
      expirationType = $expirationType
      WHERE expireTimer > 0;`
      ).run({ expirationType: 'legacy' });
    } else {
      db.prepare(
        `UPDATE ${CONVERSATIONS_TABLE} SET
      expirationType = $expirationType
      WHERE type = 'private' AND expireTimer > 0;`
      ).run({ expirationType: 'deleteAfterRead' });

      db.prepare(
        `UPDATE ${CONVERSATIONS_TABLE} SET
      expirationType = $expirationType
      WHERE (type = 'group' AND is_medium_group = true) AND expireTimer > 0;`
      ).run({ expirationType: 'deleteAfterSend' });
    }

    // TODO After testing -> rename expireTimer column to expirationTimer everywhere.
    // Update Conversation Model expireTimer calls everywhere
    //  db.exec(
    //    `ALTER TABLE ${CONVERSATIONS_TABLE} RENAME COLUMN expireTimer TO expirationTimer;`
    //  );

    // Message changes
    db.prepare(`ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN expirationType TEXT;`).run();

    // TODO After testing -> rename expireTimer column to expirationTimer everywhere.
    //  db.exec(
    //    `ALTER TABLE ${MESSAGES_TABLE} RENAME COLUMN expireTimer TO expirationTimer;`
    //  );

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

// function printTableColumns(table: string, db: BetterSqlite3.Database) {
//   console.info(db.pragma(`table_info('${table}');`));
// }

function writeSessionSchemaVersion(newVersion: number, db: BetterSqlite3.Database) {
  db.prepare(
    `INSERT INTO loki_schema(
        version
      ) values (
        $newVersion
      )`
  ).run({ newVersion });
}

export function updateSessionSchema(db: BetterSqlite3.Database) {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name='loki_schema';`)
    .get();

  if (!result) {
    createSessionSchemaTable(db);
  }
  const lokiSchemaVersion = getSessionSchemaVersion(db);
  console.log(
    'updateSessionSchema:',
    `Current loki schema version: ${lokiSchemaVersion};`,
    `Most recent schema version: ${LOKI_SCHEMA_VERSIONS.length};`
  );
  for (let index = 0, max = LOKI_SCHEMA_VERSIONS.length; index < max; index += 1) {
    const runSchemaUpdate = LOKI_SCHEMA_VERSIONS[index];
    runSchemaUpdate(lokiSchemaVersion, db);
  }
}
