import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const CTA1 = (props) => {
  return (
    <>
      <div
        className={`cta1-container thq-section-padding ${props.rootClassName} `}
      >
        <div className="cta1-max-width thq-section-max-width">
          <div className="cta1-content">
            <div className="cta1-actions">
              <button className="thq-button-outline cta1-button">
                <span className="cta1-action2 thq-body-small">
                  {props.action2 ?? (
                    <Fragment>
                      <span className="cta1-text">Learn more</span>
                    </Fragment>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .cta1-container {
            gap: var(--dl-layout-space-threeunits);
            display: flex;
            overflow: hidden;
            position: relative;
            flex-direction: column;
          }
          .cta1-max-width {
            width: 100%;
            display: flex;
            max-width: var(--dl-layout-size-maxwidth);
            align-items: center;
            flex-direction: column;
          }
          .cta1-content {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .cta1-actions {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-items: flex-start;
          }
          .cta1-action2 {
            text-align: center;
          }
          .cta1-text {
            display: inline-block;
          }
          @media (max-width: 479px) {
            .cta1-actions {
              width: 100%;
              flex-direction: column;
            }
            .cta1-button {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

CTA1.defaultProps = {
  action2: undefined,
  rootClassName: '',
}

CTA1.propTypes = {
  action2: PropTypes.element,
  rootClassName: PropTypes.string,
}

export default CTA1
