// @generated automatically by Diesel CLI.

diesel::table! {
    servers (id) {
        id -> Text,
        url -> Text,
        username -> Nullable<Text>,
        is_default -> Integer,
    }
}

diesel::table! {
    subscriptions (id) {
        id -> Text,
        server_id -> Text,
        topic -> Text,
        display_name -> Nullable<Text>,
        muted -> Integer,
        last_sync -> Nullable<BigInt>,
    }
}

diesel::table! {
    notifications (id) {
        id -> Text,
        subscription_id -> Text,
        ntfy_id -> Nullable<Text>,
        title -> Nullable<Text>,
        message -> Text,
        priority -> Integer,
        tags -> Text,
        timestamp -> BigInt,
        read -> Integer,
        actions -> Text,
        attachments -> Text,
        is_expanded -> Integer,
        is_favorite -> Integer,
    }
}

diesel::table! {
    settings (key) {
        key -> Text,
        value -> Text,
    }
}

diesel::table! {
    ignore_rules (id) {
        id -> Text,
        pattern -> Text,
        subscription_id -> Nullable<Text>,
        created_at -> BigInt,
    }
}

diesel::joinable!(subscriptions -> servers (server_id));
diesel::joinable!(notifications -> subscriptions (subscription_id));
diesel::joinable!(ignore_rules -> subscriptions (subscription_id));

diesel::allow_tables_to_appear_in_same_query!(
    ignore_rules,
    notifications,
    servers,
    settings,
    subscriptions,
);
