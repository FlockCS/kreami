import { Tabs, useRouter } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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

const PlusIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14" stroke={colors.paper} strokeWidth={1.9} strokeLinecap="round" />
    <Path d="M5 12h14" stroke={colors.paper} strokeWidth={1.9} strokeLinecap="round" />
  </Svg>
);

const PersonIcon = ({ color }: IconProps) => (
  <Svg {...S}>
    <Circle cx={12} cy={8.5} r={3.5} stroke={color} strokeWidth={1.6} />
    <Path
      d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </Svg>
);

export default function TabsLayout() {
  const router = useRouter();

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
        name="me"
        options={{ title: 'You', tabBarIcon: ({ color }) => <PersonIcon color={color} /> }}
      />
    </Tabs>
  );
}
