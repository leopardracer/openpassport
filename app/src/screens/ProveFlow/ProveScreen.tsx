import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { Image, Text, View, YStack } from 'tamagui';

import { SelfAppDisclosureConfig } from '../../../../common/src/utils/appType';
import { formatEndpoint } from '../../../../common/src/utils/scope';
import miscAnimation from '../../assets/animations/loading/misc.json';
import Disclosures from '../../components/Disclosures';
import { HeldPrimaryButton } from '../../components/buttons/PrimaryButtonLongHold';
import { BodyText } from '../../components/typography/BodyText';
import { Caption } from '../../components/typography/Caption';
import { ExpandableBottomLayout } from '../../layouts/ExpandableBottomLayout';
import { useApp } from '../../stores/appProvider';
import { usePassport } from '../../stores/passportDataProvider';
import {
  ProofStatusEnum,
  globalSetDisclosureStatus,
  useProofInfo,
} from '../../stores/proofProvider';
import { black, slate300, white } from '../../utils/colors';
import { buttonTap } from '../../utils/haptic';
import {
  isUserRegistered,
  sendVcAndDisclosePayload,
} from '../../utils/proving/payload';

const ProveScreen: React.FC = () => {
  const { navigate } = useNavigation();
  const { getPassportDataAndSecret } = usePassport();
  const { selectedApp, resetProof, cleanSelfApp } = useProofInfo();
  const { handleProofResult } = useApp();
  const selectedAppRef = useRef(selectedApp);
  const isProcessing = useRef(false);

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [scrollViewContentHeight, setScrollViewContentHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const isContentShorterThanScrollView = useMemo(
    () => scrollViewContentHeight <= scrollViewHeight,
    [scrollViewContentHeight, scrollViewHeight],
  );

  /**
   * Whenever the relationship between content height vs. scroll view height changes,
   * reset (or enable) the button state accordingly.
   */
  useEffect(() => {
    if (isContentShorterThanScrollView) {
      setHasScrolledToBottom(true);
    } else {
      setHasScrolledToBottom(false);
    }
  }, [isContentShorterThanScrollView]);

  useEffect(() => {
    if (
      !selectedApp ||
      selectedAppRef.current?.sessionId === selectedApp.sessionId
    ) {
      return; // Avoid unnecessary updates
    }
    selectedAppRef.current = selectedApp;
    console.log('[ProveScreen] Selected app updated:', selectedApp);
  }, [selectedApp]);

  const disclosureOptions = useMemo(() => {
    return (selectedApp?.disclosures as SelfAppDisclosureConfig) || [];
  }, [selectedApp?.disclosures]);

  // Format the logo source based on whether it's a URL or base64 string
  const logoSource = useMemo(() => {
    if (!selectedApp?.logoBase64) {
      return null;
    }

    // Check if the logo is already a URL
    if (
      selectedApp.logoBase64.startsWith('http://') ||
      selectedApp.logoBase64.startsWith('https://')
    ) {
      return { uri: selectedApp.logoBase64 };
    }

    // Otherwise handle as base64 as before
    const base64String = selectedApp.logoBase64.startsWith('data:image')
      ? selectedApp.logoBase64
      : `data:image/png;base64,${selectedApp.logoBase64}`;
    return { uri: base64String };
  }, [selectedApp?.logoBase64]);

  const url = useMemo(() => {
    if (!selectedApp?.endpoint) {
      return null;
    }
    return formatEndpoint(selectedApp.endpoint);
  }, [selectedApp?.endpoint]);

  const onVerify = useCallback(
    async function () {
      if (isProcessing.current) {
        return;
      }
      isProcessing.current = true;

      resetProof();
      buttonTap();
      const currentApp = selectedAppRef.current;

      try {
        let timeToNavigateToStatusScreen: NodeJS.Timeout;

        const passportDataAndSecret = await getPassportDataAndSecret().catch(
          (e: Error) => {
            console.error('Error getting passport data', e);
            globalSetDisclosureStatus?.(ProofStatusEnum.ERROR);
          },
        );

        timeToNavigateToStatusScreen = setTimeout(() => {
          navigate('ProofRequestStatusScreen');
        }, 200);

        if (!passportDataAndSecret) {
          console.log('No passport data or secret');
          globalSetDisclosureStatus?.(ProofStatusEnum.ERROR);
          setTimeout(() => {
            navigate('PassportDataNotFound');
          }, 3000);
          return;
        }

        const { passportData, secret } = passportDataAndSecret.data;
        const isRegistered = await isUserRegistered(passportData, secret);
        console.log('isRegistered', isRegistered);

        if (!isRegistered) {
          clearTimeout(timeToNavigateToStatusScreen);
          console.log(
            'User is not registered, sending to ConfirmBelongingScreen',
          );
          navigate('ConfirmBelongingScreen');
          cleanSelfApp();
          return;
        }

        console.log('currentApp', currentApp);
        const status = await sendVcAndDisclosePayload(
          secret,
          passportData,
          currentApp,
        );
        handleProofResult(
          currentApp.sessionId,
          status === ProofStatusEnum.SUCCESS,
        );
      } catch (e) {
        console.log('Error in verification process');
        globalSetDisclosureStatus?.(ProofStatusEnum.ERROR);
      } finally {
        isProcessing.current = false;
      }
    },
    [navigate, getPassportDataAndSecret, handleProofResult, resetProof],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (hasScrolledToBottom || isContentShorterThanScrollView) {
        return;
      }
      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      const paddingToBottom = 10;
      const isCloseToBottom =
        layoutMeasurement.height + contentOffset.y >=
        contentSize.height - paddingToBottom;
      if (isCloseToBottom && !hasScrolledToBottom) {
        setHasScrolledToBottom(true);
        buttonTap();
      }
    },
    [hasScrolledToBottom, isContentShorterThanScrollView],
  );

  const handleContentSizeChange = useCallback(
    (contentWidth: number, contentHeight: number) => {
      setScrollViewContentHeight(contentHeight);
    },
    [],
  );

  const handleScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
    setScrollViewHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <ExpandableBottomLayout.Layout flex={1} backgroundColor={black}>
      <ExpandableBottomLayout.TopSection backgroundColor={black}>
        <YStack alignItems="center">
          {!selectedApp.sessionId ? (
            <LottieView
              source={miscAnimation}
              autoPlay
              loop
              resizeMode="cover"
              cacheComposition={true}
              renderMode="HARDWARE"
              style={styles.animation}
              speed={1}
              progress={0}
            />
          ) : (
            <YStack alignItems="center" justifyContent="center">
              {logoSource && (
                <Image
                  mb={20}
                  source={logoSource}
                  width={100}
                  height={100}
                  objectFit="contain"
                />
              )}
              <BodyText fontSize={12} color={slate300} mb={20}>
                {url}
              </BodyText>
              <BodyText fontSize={24} color={slate300} textAlign="center">
                <Text color={white}>{selectedApp.appName}</Text> is requesting
                that you prove the following information:
              </BodyText>
            </YStack>
          )}
        </YStack>
      </ExpandableBottomLayout.TopSection>
      <ExpandableBottomLayout.BottomSection
        paddingBottom={20}
        backgroundColor={white}
        maxHeight={'55%'}
      >
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleScrollViewLayout}
        >
          <Disclosures disclosures={disclosureOptions} />
          <View marginTop={20}>
            <Caption
              textAlign="center"
              size="small"
              marginBottom={20}
              marginTop={10}
              borderRadius={4}
              paddingBottom={20}
            >
              Self will confirm that these details are accurate and none of your
              confidential info will be revealed to {selectedApp.appName}
            </Caption>
          </View>
        </ScrollView>
        <HeldPrimaryButton
          onPress={onVerify}
          disabled={!selectedApp.sessionId || !hasScrolledToBottom}
        >
          {hasScrolledToBottom
            ? 'Hold To Verify'
            : 'Please read all disclosures'}
        </HeldPrimaryButton>
      </ExpandableBottomLayout.BottomSection>
    </ExpandableBottomLayout.Layout>
  );
};

export default ProveScreen;

const styles = StyleSheet.create({
  animation: {
    top: 0,
    width: 200,
    height: 200,
    transform: [{ scale: 2 }, { translateY: -20 }],
  },
});
