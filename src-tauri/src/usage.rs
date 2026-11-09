use serde::Serialize;
use serde_json::Value;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::chats::AgentCommand;
use crate::protocol::clipped;

const MAX_PERCENT: f64 = 100.0;
const PERCENT_PRECISION: f64 = 10.0;
const NANOS_PER_MILLI: i128 = 1_000_000;
const MILLIS_PER_SECOND: i64 = 1_000;
const DEFAULT_DECIMAL_PLACES: i32 = 2;
const MAX_DECIMAL_PLACES: i64 = 6;
const MODEL_NAME_LENGTH: usize = 40;
const CURRENCY_CODE_LENGTH: usize = 3;
const NAMED_MODEL_WEEKS: [(&str, &str); 2] = [("seven_day_opus", "Opus"), ("seven_day_sonnet", "Sonnet")];

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub utilization: f64,
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelWeek {
    pub model: String,
    #[serde(flatten)]
    pub window: UsageWindow,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtraUsage {
    pub utilization: Option<f64>,
    pub used: Option<f64>,
    pub monthly_limit: Option<f64>,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanUsage {
    pub subscription_type: Option<String>,
    pub has_plan_limits: bool,
    pub session: Option<UsageWindow>,
    pub week: Option<UsageWindow>,
    pub model_weeks: Vec<ModelWeek>,
    pub extra_usage: Option<ExtraUsage>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RateLimitWindows {
    pub session: Option<UsageWindow>,
    pub week: Option<UsageWindow>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub command: AgentCommand,
    pub updated_at: i64,
    pub usage: PlanUsage,
}

impl RateLimitWindows {
    pub fn is_empty(&self) -> bool {
        self.session.is_none() && self.week.is_none()
    }
}

impl UsageReport {
    pub fn is_fresh(&self, now: i64, freshness_ms: i64) -> bool {
        now - self.updated_at < freshness_ms
    }

    pub fn merge_rate_limits(&mut self, windows: RateLimitWindows, now: i64) {
        self.usage.session = windows.session.or(self.usage.session);
        self.usage.week = windows.week.or(self.usage.week);
        self.updated_at = now;
    }
}

fn percent_of(value: f64) -> Option<f64> {
    value.is_finite().then(|| ((value * PERCENT_PRECISION).round() / PERCENT_PRECISION).clamp(0.0, MAX_PERCENT))
}

fn epoch_millis_of(timestamp: &str) -> Option<i64> {
    let moment = OffsetDateTime::parse(timestamp, &Rfc3339).ok()?;
    i64::try_from(moment.unix_timestamp_nanos() / NANOS_PER_MILLI).ok()
}

fn window_of(raw: &Value) -> Option<UsageWindow> {
    Some(UsageWindow {
        utilization: percent_of(raw["utilization"].as_f64()?)?,
        resets_at: raw["resets_at"].as_str().and_then(epoch_millis_of),
    })
}

fn fraction_window_of(raw: &Value) -> Option<UsageWindow> {
    Some(UsageWindow {
        utilization: percent_of(raw["utilization"].as_f64()? * MAX_PERCENT)?,
        resets_at: raw["resetsAt"].as_i64().and_then(|seconds| seconds.checked_mul(MILLIS_PER_SECOND)),
    })
}

fn model_week_of(model: &str, raw: &Value) -> Option<ModelWeek> {
    let model = clipped(model, MODEL_NAME_LENGTH);
    if model.is_empty() {
        return None;
    }
    Some(ModelWeek { model, window: window_of(raw)? })
}

fn model_weeks_of(limits: &Value) -> Vec<ModelWeek> {
    let scoped = limits["model_scoped"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| model_week_of(entry["display_name"].as_str()?, entry));
    let named = NAMED_MODEL_WEEKS.iter().filter_map(|(field, model)| model_week_of(model, &limits[*field]));
    let mut weeks: Vec<ModelWeek> = Vec::new();
    for week in scoped.chain(named) {
        if !weeks.iter().any(|seen| seen.model.eq_ignore_ascii_case(&week.model)) {
            weeks.push(week);
        }
    }
    weeks
}

fn currency_of(raw: &Value) -> Option<String> {
    let code = raw.as_str()?.trim();
    let is_code = code.len() == CURRENCY_CODE_LENGTH && code.chars().all(|character| character.is_ascii_alphabetic());
    is_code.then(|| code.to_ascii_uppercase())
}

fn amount_of(raw: &Value, decimal_places: i32) -> Option<f64> {
    let minor = raw.as_f64().filter(|minor| minor.is_finite() && *minor >= 0.0)?;
    Some(minor / 10f64.powi(decimal_places))
}

fn extra_usage_of(raw: &Value) -> Option<ExtraUsage> {
    if raw["is_enabled"].as_bool() != Some(true) {
        return None;
    }
    let decimal_places = raw["decimal_places"]
        .as_i64()
        .filter(|places| (0..=MAX_DECIMAL_PLACES).contains(places))
        .map_or(DEFAULT_DECIMAL_PLACES, |places| places as i32);
    Some(ExtraUsage {
        utilization: raw["utilization"].as_f64().and_then(percent_of),
        used: amount_of(&raw["used_credits"], decimal_places),
        monthly_limit: amount_of(&raw["monthly_limit"], decimal_places),
        currency: currency_of(&raw["currency"]),
    })
}

pub fn plan_usage_of(payload: &Value) -> PlanUsage {
    let limits = &payload["rate_limits"];
    PlanUsage {
        subscription_type: payload["subscription_type"].as_str().map(|plan| clipped(plan, MODEL_NAME_LENGTH)),
        has_plan_limits: payload["rate_limits_available"].as_bool().unwrap_or(false),
        session: window_of(&limits["five_hour"]),
        week: window_of(&limits["seven_day"]),
        model_weeks: model_weeks_of(limits),
        extra_usage: extra_usage_of(&limits["extra_usage"]),
    }
}

pub fn rate_limit_windows_of(info: &Value) -> RateLimitWindows {
    let windows = &info["unifiedWindows"];
    RateLimitWindows {
        session: fraction_window_of(&windows["five_hour"]),
        week: fraction_window_of(&windows["seven_day"]),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    const SESSION_RESET: i64 = 1_794_275_399_780;
    const WEEK_RESET: i64 = 1_794_470_399_780;

    fn report(usage: PlanUsage) -> UsageReport {
        UsageReport { command: AgentCommand::Claude, updated_at: 1_000, usage }
    }

    #[test]
    fn reads_percentages_and_iso_reset_times() {
        let usage = plan_usage_of(&json!({
            "rate_limits_available": true,
            "rate_limits": {
                "five_hour": {"utilization": 1, "resets_at": "2026-11-10T01:49:59.780282+00:00"},
                "seven_day": {"utilization": 27.25, "resets_at": "2026-11-12T07:59:59.780326Z"},
            },
        }));
        assert_eq!(usage.session, Some(UsageWindow { utilization: 1.0, resets_at: Some(SESSION_RESET) }));
        assert_eq!(usage.week, Some(UsageWindow { utilization: 27.3, resets_at: Some(WEEK_RESET) }));
    }

    #[test]
    fn clamps_out_of_range_values_and_drops_broken_ones() {
        let usage = plan_usage_of(&json!({
            "subscription_type": 7,
            "rate_limits": {
                "five_hour": {"utilization": 140, "resets_at": "tomorrow"},
                "seven_day": {"utilization": -3},
                "seven_day_opus": {"utilization": "a lot"},
                "model_scoped": [{"display_name": "  ", "utilization": 5}, "junk"],
                "extra_usage": {"is_enabled": true, "utilization": 50, "used_credits": -1,
                    "monthly_limit": 2500, "currency": "usd; drop table"},
            },
        }));
        assert_eq!(usage.subscription_type, None);
        assert!(!usage.has_plan_limits);
        assert_eq!(usage.session, Some(UsageWindow { utilization: 100.0, resets_at: None }));
        assert_eq!(usage.week, Some(UsageWindow { utilization: 0.0, resets_at: None }));
        assert!(usage.model_weeks.is_empty());
        let extra = ExtraUsage { utilization: Some(50.0), used: None, monthly_limit: Some(25.0), currency: None };
        assert_eq!(usage.extra_usage, Some(extra));
    }

    #[test]
    fn lists_each_model_week_once_preferring_the_scoped_list() {
        let usage = plan_usage_of(&json!({
            "rate_limits": {
                "seven_day_opus": {"utilization": 40},
                "seven_day_sonnet": {"utilization": 12},
                "model_scoped": [{"display_name": "Opus", "utilization": 41, "resets_at": null}],
            },
        }));
        let models: Vec<_> =
            usage.model_weeks.iter().map(|week| (week.model.as_str(), week.window.utilization)).collect();
        assert_eq!(models, vec![("Opus", 41.0), ("Sonnet", 12.0)]);
    }

    #[test]
    fn reads_rate_limit_fractions_and_epoch_seconds_as_percentages_and_millis() {
        let windows = rate_limit_windows_of(&json!({
            "unifiedWindows": {
                "five_hour": {"utilization": 0.03, "resetsAt": 1_794_149_400},
                "seven_day": {"utilization": 0.14, "resetsAt": 1_794_628_800},
            },
        }));
        assert_eq!(windows.session, Some(UsageWindow { utilization: 3.0, resets_at: Some(1_794_149_400_000) }));
        assert_eq!(windows.week, Some(UsageWindow { utilization: 14.0, resets_at: Some(1_794_628_800_000) }));
        assert!(rate_limit_windows_of(&json!({"status": "allowed"})).is_empty());
    }

    #[test]
    fn folds_rate_limits_into_a_report_and_keeps_what_they_leave_out() {
        let week = UsageWindow { utilization: 27.0, resets_at: Some(WEEK_RESET) };
        let mut cached = report(PlanUsage {
            subscription_type: Some("pro".into()),
            has_plan_limits: true,
            session: None,
            week: Some(week),
            model_weeks: Vec::new(),
            extra_usage: None,
        });
        let session = UsageWindow { utilization: 3.0, resets_at: None };
        cached.merge_rate_limits(RateLimitWindows { session: Some(session), week: None }, 5_000);
        assert_eq!((cached.usage.session, cached.usage.week, cached.updated_at), (Some(session), Some(week), 5_000));
        assert!(cached.is_fresh(64_999, 60_000));
        assert!(!cached.is_fresh(65_000, 60_000));
    }
}
