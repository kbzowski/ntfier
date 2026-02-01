// @generated automatically by Diesel CLI.

diesel::table! {
    servers (id) {
        id -> Text,
        url -> Text,
        username -> Nullable<Text>,
        password -> Nullable<Text>,
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
    }
}

diesel::table! {
    settings (key) {
        key -> Text,
        value -> Text,
    }
}

diesel::joinable!(subscriptions -> servers (server_id));
diesel::joinable!(notifications -> subscriptions (subscription_id));

diesel::allow_tables_to_appear_in_same_query!(
    notifications,
    servers,
    settings,
    subscriptions,
);
