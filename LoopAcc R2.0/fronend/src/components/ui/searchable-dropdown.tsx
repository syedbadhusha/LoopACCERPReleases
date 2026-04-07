import { useEffect, useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

type SearchableOption = {
  value: string;
  label: string;
};

interface SearchableDropdownProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
}

const SearchableDropdown = ({
  value,
  onValueChange,
  options,
  placeholder = 'Type or select',
  className,
}: SearchableDropdownProps) => {
  const listId = useId();
  const [inputValue, setInputValue] = useState('');

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  useEffect(() => {
    setInputValue(selectedOption?.label || '');
  }, [selectedOption]);

  const findByLabel = (label: string) => {
    const normalized = label.trim().toLowerCase();
    return options.find((option) => option.label.trim().toLowerCase() === normalized);
  };

  const handleChange = (nextInput: string) => {
    setInputValue(nextInput);

    if (!nextInput.trim()) {
      onValueChange('');
      return;
    }

    const exactMatch = findByLabel(nextInput);
    if (exactMatch) {
      onValueChange(exactMatch.value);
    }
  };

  const handleBlur = () => {
    if (!inputValue.trim()) {
      onValueChange('');
      setInputValue('');
      return;
    }

    const exactMatch = findByLabel(inputValue);
    if (exactMatch) {
      onValueChange(exactMatch.value);
      setInputValue(exactMatch.label);
      return;
    }

    setInputValue(selectedOption?.label || '');
  };

  return (
    <>
      <Input
        className={className}
        list={listId}
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>
    </>
  );
};

export default SearchableDropdown;
