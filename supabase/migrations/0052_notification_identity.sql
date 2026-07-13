-- 0052: per-rule Slack sender identity (Katie, July 13). Blank = the app's
-- default name/icon; needs the chat:write.customize bot scope to take effect.
alter table core.notification_rule add column if not exists bot_name text;
alter table core.notification_rule add column if not exists bot_icon text;
comment on column core.notification_rule.bot_name is 'Optional per-rule sender name override (chat.postMessage username). NULL = app default.';
comment on column core.notification_rule.bot_icon is 'Optional per-rule icon: an :emoji: or an https image URL. NULL = app default.';
