import React from 'react';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { occasionGroupName } from '@sichos-kodesh/app-core';
import type { OccasionGroupsScreenProps } from '../../navigation/types';
import { Row, RowCount } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';

/** The farbrengens by mafteiach's own moadim (and yemei d'pagra) or parshiyos: its names, its order, its membership. */
export function OccasionGroupsScreen({ navigation, route }: OccasionGroupsScreenProps) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const { axis } = route.params;
  const groups = axis === 'moadim' ? library.moadim : library.parshiyos;

  return (
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={axis === 'moadim' ? t.libraryByMoed : t.libraryByParsha} />}>
      {groups.map((group, index) => (
        <Row
          divider={index > 0}
          key={group.slug}
          label={occasionGroupName(group, language)}
          trailing={<RowCount>{group.occasionIds.length}</RowCount>}
          onPress={() => navigation.navigate('OccasionGroup', { axis, slug: group.slug })}
        />
      ))}
    </Screen>
  );
}
