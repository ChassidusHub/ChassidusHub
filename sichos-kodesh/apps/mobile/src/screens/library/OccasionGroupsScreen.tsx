import React from 'react';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { OccasionGroupsScreenProps } from '../../navigation/types';
import { Row, RowDistance } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';

/** The farbrengens by mafteiach's own moadim (and yemei d'pagra) or parshiyos: its names, its order, its membership. */
export function OccasionGroupsScreen({ navigation, route }: OccasionGroupsScreenProps) {
  const library = useLibrary();
  const { t } = useTranslation();
  const { axis } = route.params;
  const groups = axis === 'moadim' ? library.moadim : library.parshiyos;

  return (
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={axis === 'moadim' ? t.libraryByMoed : t.libraryByParsha} />}>
      {groups.map((group) => (
        <Row
          key={group.slug}
          label={group.name}
          trailing={<RowDistance>{group.occasionIds.length}</RowDistance>}
          onPress={() => navigation.navigate('OccasionGroup', { axis, slug: group.slug })}
        />
      ))}
    </Screen>
  );
}
