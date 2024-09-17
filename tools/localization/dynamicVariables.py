import json
import os
import re
import sys

# This allows for importing from the localization and util directories NOTE: Auto importing tools will also prepend the import paths with "tools." this will not work and needs to be removed from import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from util.listUtils import missingFromList
from util.logger import console


def extractAllMatches(input_string, pattern):
  """
  Extracts regex matches from the input string.

  Args:
    input_string (str): The string to extract regex matches from.

  Returns:
    list: A list of regex matches found in the input string.
  """
  matches = re.findall(pattern, input_string)
  if len(matches) > 0:
    console.debug(f"matches: {matches}")
  return matches


def extractOldDynamicVariables(input_string):
  """
  Extracts dynamic variables from the input string.

  Args:
    input_string (str): The string to extract dynamic variables from.

  Returns:
    list: A list of dynamic variables found in the input string.
  """
  pattern = r"\$(\w+)\$"
  matches = re.findall(pattern, input_string)
  return matches


def extractVariablesFromDict(input_dict):
  """
  Reads through a dictionary of key-value pairs and creates a new dictionary
  where the value is just a list of dynamic variables found in the original value.

  Args:
    input_dict (dict): The dictionary to extract dynamic variables from.

  Returns:
    dict: A dictionary with the same keys as input_dict, but the values are lists of dynamic variables.
  """
  output_dict_new = {}
  output_dict_old = {}
  for key, value in input_dict.items():
    console.debug(f"key: {key}, value: {value}")
    output_dict_new[key] = extractAllMatches(value, r"\{(\w+)\}")
    output_dict_old[key] = extractAllMatches(value, r"\$(\w+)\$")
  return output_dict_new, output_dict_old


def extractFormattingTags(input_dict):
  """
  Reads through a dictionary of key-value pairs and creates a new dictionary
  where the value is just a list of formatting tags found in the original value.

  Args:
    input_dict (dict): The dictionary to extract formatting tags from.

  Returns:
    dict: A dictionary with the same keys as input_dict, but the values are lists of formatting tags.
  """
  output_dict_b_tags = {}
  output_dict_br_tags = {}
  output_dict_span_tags = {}
  for key, value in input_dict.items():
    console.debug(f"key: {key}, value: {value}")
    output_dict_b_tags[key] = extractAllMatches(value, r"<b>(.*?)</b>")
    output_dict_br_tags[key] = extractAllMatches(value, r"<br/>")
    output_dict_span_tags[key] = extractAllMatches(value, r"<span>(.*?)</span>")
  return output_dict_b_tags, output_dict_br_tags, output_dict_span_tags


def identifyLocaleDyanmicVariableDifferences(locales, locale_b_tags,
                                             locale_br_tags,
                                             locale_span_tags):
  """
  Identifies the differences between each locale's dynamic variables.

  Args:
    locales (dict): A dictionary with keys being a locale name and values being a dictionary of locales.

  Returns:
    dict: A dictionary with the same keys as locales, but the values are dictionaries of issues.
  """
  master_locale = locales["en"]
  master_locale_b_tags = locale_b_tags["en"]
  master_locale_br_tags = locale_br_tags["en"]
  master_locale_span_tags = locale_span_tags["en"]
  issues = {}

  for locale_name, locale in locales.items():
    current_locale_b_tags = locale_b_tags[locale_name]
    current_locale_br_tags = locale_br_tags[locale_name]
    current_locale_span_tags = locale_span_tags[locale_name]
    if locale_name == "en":
      continue

    locale_issues = {
      "missing_keys": [],
      "additional_keys": [],
      "missing_variables": {},
      "additional_variables": {},
      "missing_b_tags": {},
      "missing_br_tags": {},
      "missing_span_tags": {},
    }

    for key, value in master_locale.items():
      # If a key is missing from the locale, add it to the missing_keys list
      if key not in locale:
        locale_issues["missing_keys"].append(key)
      else:

        locale_value = locale[key]

        # Find the dynamic variables that are missing from the locale. If there are none this will set the value to an empty list.
        locale_issues["missing_variables"][key] = missingFromList(
          value, locale_value
        )

        # Find the dynamic variables that are additional to the locale. If there are none this will set the value to an empty list.
        locale_issues["additional_variables"][key] = missingFromList(
          locale_value, value
        )

        locale_issues["missing_b_tags"][key] = len(master_locale_b_tags[key]) - len(current_locale_b_tags[key])
        locale_issues["missing_br_tags"][key] = len(master_locale_br_tags[key]) - len(current_locale_br_tags[key])
        locale_issues["missing_span_tags"][key] = len(master_locale_span_tags[key]) - len(current_locale_span_tags[key])

    for key in locale:
      if key not in master_locale:
        locale_issues["additional_keys"].append(key)

    # Only add the locale to the issues if there are any issues
    if (
      locale_issues["missing_keys"]
      or locale_issues["additional_keys"]
      or locale_issues["missing_variables"]
      or locale_issues["additional_variables"]
    ):

      # Remove empty lists from missing_variables
      locale_issues["missing_variables"] = {
        k: v for k, v in locale_issues["missing_variables"].items() if v
      }

      # Remove empty lists from additional_variables
      locale_issues["additional_variables"] = {
        k: v for k, v in locale_issues["additional_variables"].items() if v
      }

      # remove missing_keys if it's empty
      if not locale_issues["missing_keys"]:
        del locale_issues["missing_keys"]

      # remove additional_keys if it's empty
      if not locale_issues["additional_keys"]:
        del locale_issues["additional_keys"]

      # Remove missing_variables if it's empty
      if not locale_issues["missing_variables"]:
        del locale_issues["missing_variables"]

      # Remove additional_variables if it's empty
      if not locale_issues["additional_variables"]:
        del locale_issues["additional_variables"]

      console.debug_json(f"locale_issues:", locale_issues)
      issues[locale_name] = locale_issues

  return issues


def prettyPrintIssuesTable(issues):
  """
  Pretty prints a table from the return of identifyLocaleDyanmicVariableDifferences
  where the rows are locale name and the columns are the issue types.
  Values will be number of occurrences of each issues.

  Args:
    issues (dict): The issues dictionary returned from identifyLocaleDyanmicVariableDifferences.

  """

  PADDING = 10

  # Print the header key
  print(
    f"\n{'-' * 5 * PADDING:<{PADDING}}\n\n"
    f"+ Keys: Keys present in the master locale but missing in the locale\n"
    f"- Keys: Keys present in the locale but missing in the master locale\n"
    f"- Vars: Dynamic variables present in the master locale but missing in the locale\n"
    f"+ Vars: Dynamic variables present in the locale but missing in the master locale\n"
  )

  # Print the header
  print(
    f"{'Locale':<{PADDING}}{'+ Keys':<{PADDING}}{'- Keys':<{PADDING}}{'- Vars':<{PADDING}}{'+ Vars':<{PADDING}}\n"
    f"{'-' * 5 * PADDING:<{PADDING}}"
  )

  for locale_name, locale_issues in issues.items():
    if locale_name == "en":
      continue

    missing_keys = len(locale_issues.get("missing_keys", []))
    additional_keys = len(locale_issues.get("additional_keys", []))
    missing_variables = sum(
      len(v) for v in locale_issues.get("missing_variables", {}).values()
    )
    additional_variables = sum(
      len(v) for v in locale_issues.get("additional_variables", {}).values()
    )

    print(
      f"{locale_name:<{PADDING}}{missing_keys:<{PADDING}}{additional_keys:<{PADDING}}{missing_variables:<{PADDING}}{additional_variables:<{PADDING}}"
    )


def identifyAndPrintOldDynamicVariables(
  localeWithOldVariables, printOldVariables=False
):
  """
  Prints the keys that contain dynamic variables for each locale.

  Args:
    localeWithOldVariables (dict): A dictionary with keys being a locale name and values being a dictionary of locales.
  """
  found_problems = False
  for locale_name, locale in localeWithOldVariables.items():
    invalid_strings = dict()
    for key, value in locale.items():
      if value:
        invalid_strings[key] = value
        found_problems = True
    if invalid_strings:
      console.warn(
        f"{json.dumps(invalid_strings, indent=2, sort_keys=True) if printOldVariables else ''}"
        f"\nLocale {locale_name} contains {len(invalid_strings)} strings with old dynamic variables. (see above)"
      )
  return found_problems
