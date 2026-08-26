import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { useGoBack } from '@/lib/navigation';
import {
  DUPLICATE_REASON,
  REPORT_REASONS,
  useSubmitReport,
  type ReportReason,
  type ReportTarget,
} from '@/lib/reports';
import { colors } from '@/theme/tokens';

const MAX_DETAIL = 300;

/**
 * Report something.
 *
 * NOT LINKED FROM ANYWHERE right now. The screen, submit_report(), the rate
 * limit and the admin queue all work and are covered by `npm run e2e` — what
 * is missing is a way in that does not put the word REPORT under every Kreami
 * on the page. That wants an overflow menu, which is a component this app does
 * not have yet. See BACKLOG.
 *
 * Kept reachable by URL rather than deleted: the machinery is verified, and
 * re-linking it should be a component and three onPress handlers, not a
 * re-implementation.
 *
 * One screen, one decision, no confirmation step. Somebody reaching for this
 * has usually just seen something they did not want to see, and making them
 * work through a wizard to say so is its own small punishment.
 *
 * There is no follow-up: reports are answered by moderation, not by a status
 * page, and the reporter is told only that it arrived. See docs/09.
 */
export default function Report() {
  const goBack = useGoBack('/');
  const { kind, id, subject } = useLocalSearchParams<{
    kind: ReportTarget['kind'];
    id: string;
    subject?: string;
  }>();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const report = useSubmitReport();

  const reasons = kind === 'experience' ? [DUPLICATE_REASON, ...REPORT_REASONS] : REPORT_REASONS;

  if (report.isSuccess) {
    return (
      <SafeAreaView className="flex-1 bg-paper px-6" style={{ backgroundColor: colors.paper }}>
        <Text className="pt-16 font-serif text-[30px] leading-9 text-ink">Thank you</Text>
        <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
          Somebody will look at this. You will not hear back about it, but it does get read.
        </Text>
        <View className="mt-8">
          <Button label="Done" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-row items-center gap-4 px-6 pb-2 pt-5">
        <Pressable accessibilityRole="button" onPress={goBack} className="min-h-11 justify-center">
          <Text className="font-sans text-[15px] text-ink">Cancel</Text>
        </Pressable>
        <Text className="font-serif text-[26px] leading-none text-ink">Report</Text>
      </View>
      <View className="mx-6 mt-2 h-px bg-ink" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {subject ? (
          <Text className="pt-6 font-serif text-[21px] leading-7 text-ink" numberOfLines={3}>
            {subject}
          </Text>
        ) : null}

        <Text className="pb-1 pt-7 font-sans text-[10px] tracking-label text-muted">
          WHAT IS WRONG WITH IT
        </Text>

        {reasons.map((r) => {
          const chosen = reason === r.key;
          return (
            <Pressable
              key={r.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              onPress={() => setReason(r.key)}
              className="min-h-11 flex-row items-center justify-between border-b border-rule py-4 active:bg-fill"
            >
              <Text
                className="flex-1 font-sans text-[15px] leading-6"
                style={{ color: chosen ? colors.ink : colors.body }}
              >
                {r.label}
              </Text>
              {chosen ? (
                <Text className="font-sans-semibold text-[15px]" style={{ color: colors.accent }}>
                  ✓
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        <Text className="pb-2 pt-7 font-sans text-[10px] tracking-label text-muted">
          ANYTHING ELSE (OPTIONAL)
        </Text>
        <TextInput
          value={detail}
          onChangeText={(t) => setDetail(t.slice(0, MAX_DETAIL))}
          placeholder="Context that would not be obvious."
          placeholderTextColor={colors.empty}
          multiline
          maxLength={MAX_DETAIL}
          accessibilityLabel="Extra detail"
          className="min-h-14 border-b border-ink pb-2 font-sans text-[16px] leading-6 text-ink"
        />
        <View className="mt-2 flex-row justify-end">
          <Text className="font-sans text-[11px] text-muted">
            {MAX_DETAIL - detail.length} left
          </Text>
        </View>

        {report.error ? (
          <Text className="mt-4 font-sans text-[13px] leading-5" style={{ color: colors.accent }}>
            {report.error.message}
          </Text>
        ) : null}

        <View className="mt-8">
          <Button
            label="Send report"
            loading={report.isPending}
            disabled={!reason}
            onPress={() =>
              reason && report.mutate({ target: { kind: kind ?? 'kreami', id }, reason, detail })
            }
          />
        </View>

        <Text className="pt-6 font-sans text-[12px] leading-5 text-muted">
          Reports are read by a person. Filing them in bulk is itself a form of harassment and is
          rate-limited.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
