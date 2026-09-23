import React, { useMemo } from 'react';
import { Download } from 'lucide-react-native';
import catalog from '../catalog/data';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useTranslation';
import type { FollowMonthOccasionsScreenProps } from '../navigation/types';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useProgressMap } from '../player/useProgressMap';
import { monthNameForToken, resolveMonthOccasions } from '../routes/catalogRoutes';
import { Button } from '../ui/Button';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Subtitle } from '../ui/Typography';
import { useColors } from '../ui/theme';

/** Follow-flow twin of MonthOccasionsScreen (web: `/follow/:sourceYear/month/:monthToken`). */
export function FollowMonthOccasionsScreen({ navigation, route }: FollowMonthOccasionsScreenProps) {
  const { sourceYear, monthToken } = route.params;
  const { t, language } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const { enqueueBulk } = useDownload();
  const online = useOnlineStatus();
  const entries = useMemo(() => resolveMonthOccasions(catalog, sourceYear, monthToken), [sourceYear, monthToken]);
  const monthName = monthNameForToken(sourceYear, monthToken, language);

  return (
    <Screen header={<ScreenHeader back={{ name: 'FollowMonthList', params: { sourceYear } }} title={monthName} />}>
      <Subtitle>{t.occasionsIndexed(entries.length)}</Subtitle>
      {entries.map((entry) => (
        <Row
          key={entry.occasionId}
          label={entry.occasionLabel}
          trailing={
            <RowTrailing>
              <OccasionRowIcon entry={entry} progressMap={progressMap} />
            </RowTrailing>
          }
          onPress={() => navigation.navigate('Farbrengen', { kind: 'follow', sourceYear, occasionId: entry.occasionId })}
        />
      ))}

      {entries.length > 0 && online && (
        <Button
          label={t.downloadThisMonthLabel}
          icon={<Download size={16} color={colors.accentFg} />}
          onPress={() => {
            enqueueBulk(entries, 'manual').catch(() => undefined);
          }}
        />
      )}
    </Screen>
  );
}
