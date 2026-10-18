import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  NAME_MAX_LENGTH,
  validateEquipmentInput,
  type EquipmentFormErrors,
  type EquipmentFormInput,
} from '../domain/equipment';
import { toUserMessage } from '../data/DataError';
import { useEquipmentRepository } from '../data/RepositoryContext';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddEquipment'>;

export function AddEquipmentScreen({ navigation }: Props) {
  const repository = useEquipmentRepository();
  const [form, setForm] = useState<EquipmentFormInput>({ name: '', pricePerHour: '' });
  const [errors, setErrors] = useState<EquipmentFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof EquipmentFormInput) => (value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setSubmitError(null);
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    const result = validateEquipmentInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await repository.create(result.value);
      navigation.popTo('Home', { created: { id: created.id, name: created.name } });
    } catch (e) {
      setSubmitError(toUserMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Add equipment</Text>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="name-label">
            Name
          </Text>
          <TextInput
            testID="name-input"
            accessibilityLabelledBy="name-label"
            style={[styles.input, errors.name ? styles.inputError : null]}
            value={form.name}
            onChangeText={update('name')}
            placeholder="e.g. Tower Crane"
            maxLength={NAME_MAX_LENGTH}
            autoCapitalize="words"
            editable={!submitting}
            returnKeyType="next"
          />
          {errors.name ? (
            <Text testID="name-error" style={styles.fieldError}>
              {errors.name}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="price-label">
            Price per hour (₹)
          </Text>
          <TextInput
            testID="price-input"
            accessibilityLabelledBy="price-label"
            style={[styles.input, errors.pricePerHour ? styles.inputError : null]}
            value={form.pricePerHour}
            onChangeText={update('pricePerHour')}
            placeholder="e.g. 1500"
            keyboardType="decimal-pad"
            maxLength={9}
            editable={!submitting}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {errors.pricePerHour ? (
            <Text testID="price-error" style={styles.fieldError}>
              {errors.pricePerHour}
            </Text>
          ) : null}
        </View>

        {submitError ? (
          <Text testID="submit-error" style={styles.submitError}>
            {submitError}
          </Text>
        ) : null}

        <Pressable
          testID="submit-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting, busy: submitting }}
          style={[styles.button, submitting ? styles.buttonDisabled : null]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  heading: { fontSize: 24, fontWeight: 'bold', color: colors.primary },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.errorText },
  fieldError: { color: colors.errorText, fontSize: 14 },
  submitError: {
    backgroundColor: colors.errorBg,
    color: colors.errorText,
    padding: 12,
    borderRadius: 8,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
});
