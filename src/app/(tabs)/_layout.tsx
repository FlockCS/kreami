import { Tabs, useRouter } from 'expo-router';
import { Platform, Text, View, type ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { PersonGlyph } from '@/components/avatar';
import { useUnreadCount } from '@/lib/notifications';
import { colors, fonts } from '@/theme/tokens';

type IconProps = { color: ColorValue };
const S = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none' as const };

const HomeIcon = ({ color }: IconProps) => (
  <Svg {...S}>
    <Path
      d="M3 11.5 12 4l9 7.5"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M5.5 10v9.5h13V10"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SearchIcon = ({ color }: IconProps) => (
  <Svg {...S}>
    <Circle cx={10.5} cy={10.5} r={6} stroke={color} strokeWidth={1.6} />
    <Path d="M15 15l5 5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
  </Svg>
);

/**
 * The bell, with its own unread count drawn on top.
 *
 * Not react-navigation's `tabBarBadge`: it renders nothing on web here, and
 * its default styling is a system red circle that belongs to a different app.
 * Drawing it means one badge that looks the same on every platform and uses
 * the accent like everything else does.
 */
const BellIcon = ({ color, unread }: IconProps & { unread: number }) => (
  <View>
    <Svg {...S}>
      <Path
        d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.5 1.8 6.2.3.4 0 .8-.5.8H4.7c-.5 0-.8-.4-.5-.8C4.8 14.5 6 13 6 9z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>

    {unread > 0 ? (
      <View
        style={{
          position: 'absolute',
          top: -4,
          left: 12,
          minWidth: 16,
          height: 16,
          paddingHorizontal: 4,
          borderRadius: 8,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Past nine the exact number stops being information, and stops
            fitting. */}
        <Text style={{ color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 10 }}>
          {unread > 9 ? '9+' : unread}
        </Text>
      </View>
    ) : null}
  </View>
);

const PlusIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14" stroke={colors.paper} strokeWidth={1.9} strokeLinecap="round" />
    <Path d="M5 12h14" stroke={colors.paper} strokeWidth={1.9} strokeLinecap="round" />
  </Svg>
);

export default function TabsLayout() {
  const router = useRouter();
  const unread = useUnreadCount().data ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.paper },
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.rule,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 64 : undefined,
        },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarLabelStyle: { fontFamily: fonts.sans },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Discover', tabBarIcon: ({ color }) => <SearchIcon color={color} /> }}
      />
      {/*
        Compose is a modal, not a tab: it is a task you finish and leave, and
        keeping it out of the tab stack means backing out of it returns you to
        wherever you were rather than to a half-filled form.
      */}
      <Tabs.Screen
        name="post"
        options={{
          title: 'Leave a Kreami',
          tabBarIcon: () => <PlusIcon />,
          tabBarItemStyle: { paddingVertical: 6 },
          tabBarIconStyle: {
            backgroundColor: colors.accent,
            borderRadius: 999,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/compose');
          },
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <BellIcon color={color} unread={unread} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: 'You', tabBarIcon: ({ color }) => <PersonGlyph color={color} /> }}
      />
    </Tabs>
  );
}
